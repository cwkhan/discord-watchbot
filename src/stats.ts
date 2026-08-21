import type { Client } from "discord.js";
import type { StatsStore, StoredWeek, WatchbotSnapshot } from "./types.js";

export class WeeklyStats {
  private readonly startedAt = new Date();
  private periodStart = startOfWeek(new Date());
  private downtimeMs = 0;
  private downtimeStartedAt: number | null = null;
  private serversJoined = 0;
  private serversLeft = 0;
  private restarts = 0;
  private errors = 0;
  private latencies: number[] = [];

  public constructor(private readonly client: Client, private readonly store?: StatsStore) {}

  public async restore(): Promise<void> {
    const saved = await this.store?.load();
    if (!saved || new Date(saved.periodEnd) <= this.periodStart) return;
    this.periodStart = new Date(saved.periodStart);
    this.downtimeMs = saved.downtimeMs;
    this.serversJoined = saved.serversJoined;
    this.serversLeft = saved.serversLeft;
    this.restarts = saved.restarts;
    this.errors = saved.errors;
  }

  public guildJoined(): void { this.serversJoined += 1; void this.persist(); }
  public guildLeft(): void { this.serversLeft += 1; void this.persist(); }
  public restarted(): void { this.restarts += 1; void this.persist(); }
  public error(): void { this.errors += 1; void this.persist(); }
  public latency(ms: number): void {
    if (Number.isFinite(ms) && ms >= 0) this.latencies.push(ms);
    if (this.latencies.length > 100) this.latencies.shift();
  }
  public disconnected(): void { this.downtimeStartedAt ??= Date.now(); }
  public reconnected(): void {
    if (this.downtimeStartedAt !== null) {
      this.downtimeMs += Date.now() - this.downtimeStartedAt;
      this.downtimeStartedAt = null;
      void this.persist();
    }
  }

  public snapshot(): WatchbotSnapshot {
    const now = new Date();
    const currentDowntime = this.downtimeStartedAt === null ? 0 : Date.now() - this.downtimeStartedAt;
    const elapsed = Math.max(1, now.getTime() - this.periodStart.getTime());
    const downtime = this.downtimeMs + currentDowntime;
    return {
      periodStart: this.periodStart,
      periodEnd: now,
      downtimeMs: downtime,
      serversJoined: this.serversJoined,
      serversLeft: this.serversLeft,
      restarts: this.restarts,
      errors: this.errors,
      totalServers: this.client.guilds.cache.size,
      totalUsers: this.client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
      uptimePercentage: Math.max(0, Math.min(100, ((elapsed - downtime) / elapsed) * 100)),
      averageLatency: Math.round(
        this.latencies.length ? this.latencies.reduce((total, value) => total + value, 0) / this.latencies.length : this.client.ws.ping,
      ),
    };
  }

  public async flush(): Promise<void> { await this.persist(); }

  public async rollWeekIfNeeded(now = new Date()): Promise<WatchbotSnapshot | null> {
    if (now.getTime() - this.periodStart.getTime() < 7 * 86_400_000) return null;
    const previous = this.snapshot();
    this.periodStart = startOfWeek(now);
    this.downtimeMs = 0;
    this.serversJoined = 0;
    this.serversLeft = 0;
    this.restarts = 0;
    this.errors = 0;
    this.latencies = [];
    await this.persist();
    return previous;
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    const now = new Date();
    const week: StoredWeek = {
      periodStart: this.periodStart.toISOString(),
      periodEnd: now.toISOString(),
      startedAt: this.startedAt.toISOString(),
      downtimeMs: this.downtimeMs,
      serversJoined: this.serversJoined,
      serversLeft: this.serversLeft,
      restarts: this.restarts,
      errors: this.errors,
    };
    try { await this.store.save(week); } catch { /* Persistence must never interrupt bot events. */ }
  }
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return result;
}