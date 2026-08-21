import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { Events, MessageFlags } from "discord.js";
import watchbot from "../src/index.js";

function fakeClient() {
  const emitter = new EventEmitter();
  const cache = new Map<string, any>();
  (cache as any).reduce = (callback: (total: number, value: any) => number, initial: number) => {
    let result = initial;
    for (const value of cache.values()) result = callback(result, value);
    return result;
  };
  return Object.assign(emitter, {
    guilds: { cache },
    ws: { ping: 42 },
    uptime: 1_000,
    user: { tag: "Watchbot#0001" },
    channels: { fetch: async () => null },
  }) as any;
}

test("initialization is idempotent for the same client", async () => {
  const client = fakeClient();
  const first = watchbot({ client });
  const second = watchbot({ client });
  assert.strictEqual(first, second);
  await first.stop();
});

test("guild notifications use Components V2 without a custom color", async () => {
  const client = fakeClient();
  const sent: any[] = [];
  const monitor = watchbot({
    client,
    joinLeave: true,
    joinLeaveChannel: "channel",
    fetchChannel: async () => ({
      isTextBased: () => true,
      send: async (payload: unknown) => sent.push(payload),
    } as any),
  });

  const guild = {
    name: "Example Guild",
    id: "guild-id",
    ownerId: "owner-id",
    memberCount: 12,
  };
  client.guilds.cache.set(guild.id, guild);
  client.emit(Events.GuildCreate, guild);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].flags, MessageFlags.IsComponentsV2);
  assert.equal(sent[0].embeds, undefined);
  assert.equal(sent[0].components.length, 1);
  assert.equal(sent[0].components[0].accent_color, undefined);
  await monitor.stop();
});

test("snapshot tracks guild growth and latency", async () => {
  const client = fakeClient();
  const monitor = watchbot({ client, joinLeave: true });
  client.guilds.cache.set("a", { memberCount: 10 });
  client.emit(Events.GuildCreate, { name: "A", id: "a", ownerId: "o", memberCount: 10 });
  client.emit(Events.GuildDelete, { name: "A", id: "a", memberCount: 10 });
  client.ws.ping = 55;
  client.emit(Events.ClientReady);
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.serversJoined, 1);
  assert.equal(snapshot.serversLeft, 1);
  assert.equal(snapshot.totalUsers, 10);
  assert.equal(snapshot.averageLatency, 55);
  await monitor.stop();
});