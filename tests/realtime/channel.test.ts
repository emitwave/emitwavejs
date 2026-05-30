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

  it("listens for matching named events", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.listen("invoice.created", cb);

    sub._trigger("publication", {
      data: {
        event: "invoice.created",
        data: { invoiceId: "inv_123" },
      },
    });

    expect(cb).toHaveBeenCalledWith(
      { invoiceId: "inv_123" },
      { event: "invoice.created", data: { invoiceId: "inv_123" } },
    );
  });

  it("listen auto-subscribes", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    channel.listen("invoice.created", vi.fn());

    expect(sub.subscribe).toHaveBeenCalledTimes(1);
  });

  it("multiple listen calls only subscribe once", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    channel.listen("invoice.created", vi.fn());
    channel.listen("invoice.paid", vi.fn());

    expect(sub.subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not call named listeners for non-matching events", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.listen("invoice.created", cb);

    sub._trigger("publication", {
      data: {
        event: "invoice.updated",
        data: { invoiceId: "inv_123" },
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple named event listeners on the same channel", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const created = vi.fn();
    const paid = vi.fn();
    channel.listen("invoice.created", created);
    channel.listen("invoice.paid", paid);

    sub._trigger("publication", {
      data: {
        event: "invoice.created",
        data: { invoiceId: "inv_123" },
      },
    });
    sub._trigger("publication", {
      data: {
        event: "invoice.paid",
        data: { invoiceId: "inv_123" },
      },
    });

    expect(created).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it("stopListening removes a named event listener", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.listen("invoice.created", cb);
    channel.stopListening("invoice.created", cb);

    sub._trigger("publication", {
      data: {
        event: "invoice.created",
        data: { invoiceId: "inv_123" },
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it("still emits raw envelope as message", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    const cb = vi.fn();
    channel.on("message", cb);

    const payload = {
      event: "invoice.created",
      data: { invoiceId: "inv_123" },
    };
    sub._trigger("publication", { data: payload });

    expect(cb).toHaveBeenCalledWith(payload);
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

  it("subscribe is idempotent", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);
    channel.subscribe();
    channel.subscribe();
    expect(sub.subscribe).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe allows a later listen to subscribe again", () => {
    const sub = createMockSubscription();
    const channel = new Channel("test", sub as any, logger);

    channel.listen("invoice.created", vi.fn());
    channel.unsubscribe();
    channel.listen("invoice.paid", vi.fn());

    expect(sub.subscribe).toHaveBeenCalledTimes(2);
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
