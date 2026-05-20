import { describe, it, expect, vi } from "vitest";
import { Channel } from "../../src/realtime/channel.js";
import { createLogger } from "../../src/utils.js";

function createMockSubscription() {
  const handlers = new Map<string, Function>();
  return {
    on: vi.fn((event: string, cb: Function) => {
      handlers.set(event, cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    history: vi.fn().mockResolvedValue({
      publications: [
        { data: { text: "hello" }, offset: 1 },
        { data: { text: "world" }, offset: 2 },
      ],
    }),
    _trigger(event: string, ctx: unknown) {
      handlers.get(event)?.(ctx);
    },
  };
}

describe("Channel", () => {
  const logger = createLogger(false);

  it("emits message on publication", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("message", cb);

    sub._trigger("publication", { data: { text: "hello" } });
    expect(cb).toHaveBeenCalledWith({ text: "hello" });
  });

  it("emits subscribe event", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("subscribe", cb);

    sub._trigger("subscribed", {});
    expect(cb).toHaveBeenCalled();
  });

  it("emits unsubscribe event", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("unsubscribe", cb);

    sub._trigger("unsubscribed", {});
    expect(cb).toHaveBeenCalled();
  });

  it("emits error event", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("error", cb);

    sub._trigger("error", { error: { message: "fail" } });
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it("subscribe calls subscription.subscribe", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);
    channel.subscribe();
    expect(sub.subscribe).toHaveBeenCalled();
  });

  it("unsubscribe calls subscription.unsubscribe", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);
    channel.unsubscribe();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it("history returns publication data", async () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);
    const data = await channel.history(10);
    expect(data).toEqual([{ text: "hello" }, { text: "world" }]);
  });

  it("off removes listener", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("message", cb);
    channel.off("message", cb);

    sub._trigger("publication", { data: "test" });
    expect(cb).not.toHaveBeenCalled();
  });
});
