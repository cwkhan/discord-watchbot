import {
  Events,
  type Client,
  type Guild,
  type MessageCreateOptions,
  type TextBasedChannel,
} from "discord.js";
import { errorMessage, formatDuration, guildJoinMessage, guildLeaveMessage, lifecycleMessage, weeklyStatsMessage } from "./format.js";
import { WeeklyStats } from "./stats.js";
import type { Watchbot, WatchbotLogger, WatchbotOptions } from "./types.js";

const instances = new WeakMap<Client, WatchbotImpl>();
const globalInstances = new Set<WatchbotImpl>();
let processHooksInstalled = false;

const defaults = {
  joinLeave: false,
  errorLogs: false,
  uptimeStats: false,
  readyNotifications: true,
  reconnectNotifications: true,
  shardEvents: true,
  apiErrors: true,
  restartNotifications: true,
  weeklyStatsDay: 0,
  weeklyStatsHour: 9,
  timezone: "UTC",
};

export default function watchbot(options: WatchbotOptions): Watchbot {
  if (!options?.client) throw new TypeError("discord-watchbot requires a Discord.js client.");
  const existing = instances.get(options.client);
  if (existing) return existing;
  const instance = new WatchbotImpl(options);
  instances.set(options.client, instance);
  globalInstances.add(instance);
  installProcessHooks();
  return instance;
}

export { WatchbotImpl, WeeklyStats };
export * from "./types.js";

class WatchbotImpl implements Watchbot {
  public readonly client: Client;
  public readonly options: Readonly<Required<Pick<WatchbotOptions, "joinLeave" | "errorLogs" | "uptimeStats">>>;
  private readonly config: WatchbotOptions & typeof defaults;
  private readonly stats: WeeklyStats;
  private readonly logger: WatchbotLogger;
  private readonly handlers: Array<[string, (...args: any[]) => void]> = [];
  private weeklyTimer?: NodeJS.Timeout;
  private stopped = false;
  private readyCount = 0;

  public constructor(options: WatchbotOptions) {
    this.client = options.client;
    this.config = { ...defaults, ...options };
    this.options = {
      joinLeave: this.config.joinLeave,
      errorLogs: this.config.errorLogs,
      uptimeStats: this.config.uptimeStats,
    };
    this.logger = {
      debug: options.logger?.debug ?? (() => undefined),
      info: options.logger?.info ?? (() => undefined),
      warn: options.logger?.warn ?? (() => undefined),
      error: options.logger?.error ?? (() => undefined),
    };
    this.stats = new WeeklyStats(this.client, options.statsStore);
    void this.stats.restore();
    this.registerListeners();
    if (this.config.uptimeStats) {
      this.weeklyTimer = setInterval(() => void this.sendWeeklyStats(), 60 * 60 * 1_000);
      this.weeklyTimer.unref();
    }
  }

  public snapshot() { return this.stats.snapshot(); }
  public flushStats() { return this.stats.flush(); }

  public async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const [event, handler] of this.handlers) this.client.off(event, handler);
    if (this.weeklyTimer) clearInterval(this.weeklyTimer);
    globalInstances.delete(this);
    await this.stats.flush();
  }

  private registerListeners(): void {
    if (this.config.joinLeave) {
      this.on(Events.GuildCreate, (guild: Guild) => {
        this.stats.guildJoined();
        void this.send(this.config.joinLeaveChannel, guildJoinMessage({
          name: guild.name,
          id: guild.id,
          owner: guild.ownerId,
          members: guild.memberCount,
          totalGuilds: this.client.guilds.cache.size,
          uptime: formatDuration(this.client.uptime ?? 0),
          timestamp: new Date().toISOString(),
        }));
      });
      this.on(Events.GuildDelete, (guild: Guild) => {
        const previousGuilds = this.client.guilds.cache.size + 1;
        this.stats.guildLeft();
        void this.send(this.config.joinLeaveChannel, guildLeaveMessage({
          name: guild.name,
          id: guild.id,
          previousGuilds,
          currentGuilds: this.client.guilds.cache.size,
          timestamp: new Date().toISOString(),
        }));
      });
    }

    this.on(Events.ClientReady, () => {
      this.readyCount += 1;
      this.stats.reconnected();
      this.stats.latency(this.client.ws.ping);
      if ((this.readyCount === 1 && this.config.readyNotifications) || (this.readyCount > 1 && this.config.restartNotifications)) {
        void this.send(this.config.statsChannel, lifecycleMessage(this.readyCount === 1 ? "Bot ready" : "Bot restarted", [
        `**User:** ${this.client.user?.tag ?? "Unknown"}`,
        `**Servers:** ${this.client.guilds.cache.size.toLocaleString()}`,
        `**Uptime:** ${formatDuration(this.client.uptime ?? 0)}`,
        `**Timestamp:** ${new Date().toISOString()}`,
        ]));
        if (this.readyCount > 1) this.stats.restarted();
      }
    });
    this.on(Events.Warn, (message: string) => this.handleError("Discord API warning", new Error(message)));
    this.on(Events.Error, (error: Error) => this.handleError("Discord client error", error));

    this.on(Events.ShardReconnecting, (id: number) => {
      this.stats.disconnected();
      if (this.config.reconnectNotifications) void this.send(this.config.statsChannel, lifecycleMessage("Shard reconnecting", [`**Shard:** ${id}`, `**Timestamp:** ${new Date().toISOString()}`]));
    });
    this.on(Events.ShardDisconnect, (closeEvent: CloseEvent, id: number) => {
      this.stats.disconnected();
      if (this.config.shardEvents) void this.send(this.config.errorChannel, lifecycleMessage("Shard disconnected", [`**Shard:** ${id}`, `**Code:** ${closeEvent.code}`, `**Timestamp:** ${new Date().toISOString()}`]));
    });
    this.on(Events.ShardReady, (id: number) => {
      this.stats.reconnected();
      if (this.config.shardEvents) void this.send(this.config.statsChannel, lifecycleMessage("Shard ready", [`**Shard:** ${id}`, `**Timestamp:** ${new Date().toISOString()}`]));
    });
    this.on(Events.ShardError, (error: Error, id: number) => this.handleError("Discord shard error", error, String(id)));
  }

  private handleError(type: string, error: Error, shard?: string): void {
    this.stats.error();
    if (!this.config.errorLogs && !this.config.apiErrors) return;
    void this.send(this.config.errorChannel, errorMessage({
      type, message: error.message, stack: error.stack, shard, timestamp: new Date().toISOString(),
    }));
  }

  private async send(channelId: string | undefined, payload: MessageCreateOptions): Promise<void> {
    if (!channelId) {
      this.logger.warn("Watchbot notification skipped: no destination channel was configured.");
      return;
    }
    try {
      const channel = this.config.fetchChannel
        ? await this.config.fetchChannel(channelId)
        : await this.client.channels.fetch(channelId) as TextBasedChannel | null;
      if (!channel?.isTextBased() || !("send" in channel)) throw new Error(`Channel ${channelId} is not text-based or cannot receive messages.`);
      await channel.send(payload);
    } catch (error) {
      this.logger.error("Watchbot could not send a notification.", error);
    }
  }

  private on(event: string, handler: (...args: any[]) => void): void {
    this.handlers.push([event, handler]);
    this.client.on(event as never, handler);
  }

  private async sendWeeklyStats(): Promise<void> {
    const previous = await this.stats.rollWeekIfNeeded();
    if (previous && this.config.uptimeStats) await this.send(this.config.statsChannel, weeklyStatsMessage(previous));
  }
}

function installProcessHooks(): void {
  if (processHooksInstalled) return;
  processHooksInstalled = true;
  process.on("uncaughtException", (error) => {
    for (const instance of globalInstances) instance["handleError"]("Unhandled exception", error);
  });
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    for (const instance of globalInstances) instance["handleError"]("Unhandled promise rejection", error);
  });
}