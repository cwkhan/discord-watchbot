# discord-watchbot
  
Production-ready event notifications and weekly health statistics for
Discord.js bots. `discord-watchbot` registers the listeners for you and sends
clear, low-noise notifications using Discord Components V2 / Display
Components.

## Join the support server. 

[![</Cw khan>](https://cwkhan.is-a.dev/api/widget/svg?id=787315610102530048&n=%3C%2FCw+khan%3E&t=discord&m=562&o=30&b=https%3A%2F%2Fi.ibb.co%2F0phjK8NK%2Fb1b1f8f1a11b.png&ic=https%3A%2F%2Fi.ibb.co%2Fxq7kkNZg%2F0e7e946da3d8.jpg&inv=3c24dYbK83&d=Join+cwkhan+server+now&lp=center)](https://discord.gg/3c24dYbK83)

It is intentionally small at the call site:

```js
const watchbot = require("discord-watchbot");

watchbot({
  client,
  joinLeave: true,
  errorLogs: true,
  uptimeStats: true,
  joinLeaveChannel: "12638",
  errorChannel: "28382",
  statsChannel: "28382",
});
```

## Installation

```bash
npm install discord-watchbot discord.js
```

Requirements:

- Node.js 18.18.0 or newer
- discord.js 14.18.0 or newer, but below 15
- A bot with permission to view and send messages in notification channels
- Components V2 enabled by Discord for your bot/application

## Quick start

```js
const { Client, GatewayIntentBits } = require("discord.js");
const watchbot = require("discord-watchbot");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

watchbot({
  client,
  joinLeave: true,
  errorLogs: true,
  uptimeStats: true,
  joinLeaveChannel: process.env.WATCHBOT_JOIN_CHANNEL,
  errorChannel: process.env.WATCHBOT_ERROR_CHANNEL,
  statsChannel: process.env.WATCHBOT_STATS_CHANNEL,
});

client.login(process.env.DISCORD_TOKEN);
```

The package should be initialized once, before `client.login()`. Calling it
again with the same client returns the existing monitor and does not add
duplicate listeners.

## Configuration

Every option is optional except `client`. Features default to safe values:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `client` | `Client` | required | The Discord.js client to monitor. |
| `joinLeave` | boolean | `false` | Guild join and leave messages. |
| `errorLogs` | boolean | `false` | Runtime, process, and client error messages. |
| `uptimeStats` | boolean | `false` | Weekly uptime and growth reports. |
| `readyNotifications` | boolean | `true` | Bot startup/ready messages. |
| `reconnectNotifications` | boolean | `true` | Shard reconnect messages. |
| `shardEvents` | boolean | `true` | Shard ready, disconnect, and error messages. |
| `apiErrors` | boolean | `true` | Discord client warnings/errors. |
| `restartNotifications` | boolean | `true` | Reserved lifecycle switch for restart messages. |
| `joinLeaveChannel` | string | unset | Destination channel for guild changes. |
| `errorChannel` | string | unset | Destination channel for errors. |
| `statsChannel` | string | unset | Destination channel for lifecycle/stats messages. |
| `weeklyStatsDay` | 0–6 | `0` | Reserved schedule preference, Sunday is `0`. |
| `weeklyStatsHour` | 0–23 | `9` | Reserved schedule preference, in `timezone`. |
| `timezone` | string | `UTC` | Schedule timezone label for applications that persist scheduling externally. |
| `statsStore` | `StatsStore` | memory only | Optional persistence adapter. |
| `logger` | object | silent | Optional `{ debug, info, warn, error }` logger. |
| `fetchChannel` | function | Discord.js fetch | Optional channel resolver for tests or custom caching. |

Feature flags are independent. For example, `joinLeave: true` only needs
`joinLeaveChannel`; missing destinations are skipped with a logger warning.

## Available events

Watchbot listens to:

- `guildCreate` — server name, ID, owner ID, member count, current guild count,
  uptime, and timestamp.
- `guildDelete` — server name, ID, previous/current guild count, and timestamp.
- `ready` — bot tag, server count, uptime, and timestamp.
- `error` — Discord.js client errors.
- `warn` — Discord API/client warnings.
- `shardReconnecting` — shard reconnecting state.
- `shardDisconnect` — shard ID and close code.
- `shardReady` — shard ready state.
- `shardError` — shard-specific errors.
- `uncaughtException` — process-level exception.
- `unhandledRejection` — process-level rejected promise.

Listeners are attached once per client and removed by `stop()`.

## What Watchbot sends to Discord

Every notification is a Components V2 message with a Watchbot heading and
plain text fields. Watchbot intentionally does not send embeds and never sets
an accent color, so Discord uses its default component color.

### Guild joined

Sent to `joinLeaveChannel` when the bot joins a server:

- Server name
- Server ID
- Owner ID
- Member count
- Current total guild count
- Current bot uptime
- Join timestamp

### Guild left

Sent to `joinLeaveChannel` when the bot leaves or is removed from a server:

- Server name
- Server ID
- Previous guild count
- Current guild count
- Leave timestamp

### Bot ready and restart

Sent to `statsChannel`:

- Bot tag
- Current server count
- Current uptime
- Timestamp

The first `ready` event is reported as **Bot ready**. A later ready cycle is
reported as **Bot restarted** when `restartNotifications` is enabled.

### Errors and warnings

Sent to `errorChannel` when enabled:

- Error category
- Error message
- Stack trace when available
- Shard ID when relevant
- Timestamp

This includes Discord.js client errors, Discord API warnings, shard errors,
uncaught exceptions, and unhandled promise rejections.

### Shard events

Sent to `statsChannel` or `errorChannel` depending on the event:

- Shard reconnecting: shard ID and timestamp
- Shard ready: shard ID and timestamp
- Shard disconnected: shard ID, gateway close code, and timestamp
- Shard error: shard ID plus the normal error details

### Weekly statistics

Sent to `statsChannel` after each seven-day reporting period:

- Reporting period start and end
- Uptime percentage
- Measured downtime
- Total servers
- Servers joined
- Servers left
- Total users
- Average gateway latency
- Restart count
- Error count

## Components V2

All Watchbot notifications use `MessageFlags.IsComponentsV2` and Display
Components (`ContainerBuilder` and `TextDisplayBuilder`). They do not use
embeds, legacy content layouts, or custom accent colors. This means every
message uses Discord's default component color as requested.

Enable Components V2 in the Discord Developer Portal if your application
requires the capability. The bot still needs `ViewChannel` and `SendMessages`
in each destination channel.

## Weekly statistics

When `uptimeStats` is enabled, Watchbot tracks a weekly reporting period:

- uptime and measured downtime
- total servers and total users at report time
- servers joined and left
- average observed gateway latency
- restart and error counts
- ISO reporting period timestamps

The monitor checks hourly and emits a report when the period rolls over.
In-memory tracking is the default. Production bots can provide a small store:

```js
const statsStore = {
  async load() {
    return await database.watchbotWeeks.findLatest();
  },
  async save(week) {
    await database.watchbotWeeks.upsert(week);
  },
};

watchbot({ client, uptimeStats: true, statsChannel: "28382", statsStore });
```

Persistence errors never interrupt bot event handling.

## CommonJS and ESM

CommonJS:

```js
const watchbot = require("discord-watchbot");
```

ESM:

```js
import watchbot from "discord-watchbot";
```

Named exports are also available for TypeScript and advanced integrations:

```js
import watchbot, { WeeklyStats, WatchbotImpl } from "discord-watchbot";
```

## API reference

### `watchbot(options): Watchbot`

Creates or returns the monitor for a Discord.js client.

Returned methods:

- `snapshot()` — returns the current `WatchbotSnapshot`.
- `flushStats()` — persists the current week through `statsStore`.
- `stop()` — removes listeners, stops the stats timer, flushes state, and
  unregisters process hooks for this instance.

### `StatsStore`

```ts
interface StatsStore {
  load(): Promise<StoredWeek | null> | StoredWeek | null;
  save(week: StoredWeek): Promise<void> | void;
}
```

The adapter owns its database schema and can use any database, file, or key
value store. Do not put tokens or credentials in the stored data.

## Troubleshooting

**No message appears:** confirm the relevant feature flag and channel ID,
then check `ViewChannel` and `SendMessages`. Pass a logger to see skipped-send
warnings.

**`Components V2` errors:** update Discord.js to 14.18 or newer and enable the
Components V2 capability in the Developer Portal.

**Duplicate messages:** initialize Watchbot once per client. Repeated
initialization is safe and returns the existing instance; avoid creating
multiple clients for the same bot.

**No weekly report:** `uptimeStats` must be `true`, `statsChannel` must be set,
and the process must remain alive long enough for the weekly rollover check.

**Missing owner name:** Discord.js may not have fetched the owner user. The
default payload uses the owner ID so notifications remain useful without
additional API requests.

## Development

```bash
npm install
npm run check
npm test
npm run pack:check
```

## License

MIT © cwkhan