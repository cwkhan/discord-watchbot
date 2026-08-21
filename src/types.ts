import type {
  Client,
  ClientEvents,
  Guild,
  TextBasedChannel,
} from "discord.js";

export type WatchbotLogger = {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
};

export interface StatsStore {
  load(): Promise<StoredWeek | null> | StoredWeek | null;
  save(week: StoredWeek): Promise<void> | void;
}

export interface StoredWeek {
  periodStart: string;
  periodEnd: string;
  startedAt: string;
  downtimeMs: number;
  serversJoined: number;
  serversLeft: number;
  restarts: number;
  errors: number;
}

export interface WatchbotOptions {
  client: Client;
  joinLeave?: boolean;
  errorLogs?: boolean;
  uptimeStats?: boolean;
  readyNotifications?: boolean;
  reconnectNotifications?: boolean;
  shardEvents?: boolean;
  apiErrors?: boolean;
  restartNotifications?: boolean;
  joinLeaveChannel?: string;
  errorChannel?: string;
  statsChannel?: string;
  weeklyStatsDay?: number;
  weeklyStatsHour?: number;
  timezone?: string;
  statsStore?: StatsStore;
  logger?: Partial<WatchbotLogger>;
  fetchChannel?: (channelId: string) => Promise<TextBasedChannel | null>;
}

export interface WatchbotSnapshot {
  periodStart: Date;
  periodEnd: Date;
  downtimeMs: number;
  serversJoined: number;
  serversLeft: number;
  restarts: number;
  errors: number;
  totalServers: number;
  totalUsers: number;
  uptimePercentage: number;
  averageLatency: number;
}

export interface Watchbot {
  readonly client: Client;
  readonly options: Readonly<Required<Pick<WatchbotOptions, "joinLeave" | "errorLogs" | "uptimeStats">>>;
  snapshot(): WatchbotSnapshot;
  flushStats(): Promise<void>;
  stop(): Promise<void>;
}

export type WatchbotEventName = keyof ClientEvents;

export interface GuildStats {
  guild: Guild;
  totalGuilds: number;
  totalUsers: number;
}