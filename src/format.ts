import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { WatchbotSnapshot } from "./types.js";

const MAX_FIELD = 3_800;

export function displayMessage(title: string, lines: string[]): MessageCreateOptions {
  const body = [`## ${title}`, "", ...lines].join("\n");
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(body.slice(0, MAX_FIELD)),
      ),
    ],
  };
}

export function guildJoinMessage(data: {
  name: string;
  id: string;
  owner: string;
  members: number;
  totalGuilds: number;
  uptime: string;
  timestamp: string;
}) {
  return displayMessage("Watchbot · Guild joined", [
    `**Server:** ${safe(data.name)}`,
    `**Server ID:** \`${data.id}\``,
    `**Owner:** ${safe(data.owner)}`,
    `**Members:** ${data.members.toLocaleString()}`,
    `**Total guilds:** ${data.totalGuilds.toLocaleString()}`,
    `**Bot uptime:** ${data.uptime}`,
    `**Joined:** ${data.timestamp}`,
  ]);
}

export function guildLeaveMessage(data: {
  name: string;
  id: string;
  previousGuilds: number;
  currentGuilds: number;
  timestamp: string;
}) {
  return displayMessage("Watchbot · Guild left", [
    `**Server:** ${safe(data.name)}`,
    `**Server ID:** \`${data.id}\``,
    `**Guild count:** ${data.previousGuilds.toLocaleString()} → ${data.currentGuilds.toLocaleString()}`,
    `**Left:** ${data.timestamp}`,
  ]);
}

export function errorMessage(data: {
  type: string;
  message: string;
  stack?: string;
  shard?: string;
  timestamp: string;
}) {
  const lines = [
    `**Type:** ${safe(data.type)}`,
    `**Message:** ${safe(data.message)}`,
    data.shard ? `**Shard:** ${safe(data.shard)}` : "",
    `**Timestamp:** ${data.timestamp}`,
    data.stack ? `**Stack:**\n\`\`\`\n${truncate(data.stack, 1_600)}\n\`\`\`` : "",
  ].filter(Boolean);
  return displayMessage("Watchbot · Error", lines);
}

export function lifecycleMessage(title: string, details: string[]) {
  return displayMessage(`Watchbot · ${title}`, details);
}

export function weeklyStatsMessage(snapshot: WatchbotSnapshot) {
  return displayMessage("Watchbot · Weekly statistics", [
    `**Reporting period:** ${snapshot.periodStart.toISOString()} → ${snapshot.periodEnd.toISOString()}`,
    `**Uptime:** ${snapshot.uptimePercentage.toFixed(2)}%`,
    `**Downtime:** ${formatDuration(snapshot.downtimeMs)}`,
    `**Total servers:** ${snapshot.totalServers.toLocaleString()}`,
    `**Servers joined:** ${snapshot.serversJoined.toLocaleString()}`,
    `**Servers left:** ${snapshot.serversLeft.toLocaleString()}`,
    `**Total users:** ${snapshot.totalUsers.toLocaleString()}`,
    `**Average latency:** ${snapshot.averageLatency}ms`,
    `**Restarts / errors:** ${snapshot.restarts} / ${snapshot.errors}`,
  ]);
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    !days && !hours && !minutes ? `${seconds}s` : "",
  ].filter(Boolean).join(" ");
}

function safe(value: string): string {
  return value.replace(/[`*_~|]/g, "\\$&").slice(0, MAX_FIELD);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}