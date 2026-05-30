import { describe, it, expect, vi } from "vitest";
import { PresenceChannel } from "../../src/realtime/presence.js";
import { createLogger } from "../../src/utils.js";

function createMockSubscription() {
  const handlers = new Map<string, Function>();
  return {
    on: vi.fn((event: string, cb: Function) => {
      handlers.set(event, cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    history: vi.fn().mockResolvedValue({ publications: [] }),
    presence: vi.fn().mockResolvedValue({
      clients: {
        client_1: { client: "client_1", user: "user_1" },
        client_2: { client: "client_2", user: "user_2" },
      },
    }),
    _trigger(event: string, ctx: unknown) {
      handlers.get(event)?.(ctx);
    },
  };
}

describe("PresenceChannel", () => {
  const logger = createLogger(false);

  it("emits join event", () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("join", cb);

    sub._trigger("join", { info: { client: "c1", user: "u1" } });
    expect(cb).toHaveBeenCalledWith({
      clientId: "c1",
      userId: "u1",
      info: { client: "c1", user: "u1" },
    });
  });

  it("emits leave event", () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("leave", cb);

    sub._trigger("leave", { info: { client: "c1", user: "u1" } });
    expect(cb).toHaveBeenCalledWith({
      clientId: "c1",
      userId: "u1",
      info: { client: "c1", user: "u1" },
    });
  });

  it("returns members list", async () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    const members = await channel.members();
    expect(members).toEqual([
      { clientId: "client_1", userId: "user_1", info: { client: "client_1", user: "user_1" } },
      { clientId: "client_2", userId: "user_2", info: { client: "client_2", user: "user_2" } },
    ]);
  });

  it("listens for matching named events", () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    const cb = vi.fn();
    channel.listen("member.updated", cb);

    sub._trigger("publication", {
      data: {
        event: "member.updated",
        data: { userId: "user_1" },
      },
    });

    expect(cb).toHaveBeenCalledWith(
      { userId: "user_1" },
      { event: "member.updated", data: { userId: "user_1" } },
    );
  });

  it("listen auto-subscribes once", () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    channel.listen("member.updated", vi.fn());
    channel.listen("member.removed", vi.fn());

    expect(sub.subscribe).toHaveBeenCalledTimes(1);
  });

  it("still emits channel events like message", () => {
    const sub = createMockSubscription();
    const channel = new PresenceChannel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("message", cb);

    sub._trigger("publication", { data: { text: "hi" } });
    expect(cb).toHaveBeenCalledWith({ text: "hi" });
  });
});
