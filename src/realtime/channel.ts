import type { Subscription } from "centrifuge";
import { TypedEmitter } from "../emitter.js";
import type {
  ChannelEvents,
  RealtimeEventCallback,
  RealtimePublicationEnvelope,
} from "../types.js";
import type { Logger } from "../utils.js";

export class Channel {
  readonly name: string;
  protected emitter: TypedEmitter<ChannelEvents>;
  protected eventListeners = new Map<string, Set<RealtimeEventCallback>>();
  private hasSubscribeBeenRequested = false;
  protected subscription: Subscription;
  protected logger: Logger;

  constructor(
    name: string,
    subscription: Subscription,
    logger: Logger,
    bindEvents = true,
  ) {
    this.name = name;
    this.subscription = subscription;
    this.logger = logger;
    this.emitter = new TypedEmitter<ChannelEvents>();
    if (bindEvents) this.bindEvents();
  }

  protected bindEvents(): void {
    this.subscription.on("publication", (ctx) => {
      this.emitPublication(ctx.data);
    });

    this.subscription.on("subscribed", () => {
      this.logger.log(`Subscribed to ${this.name}`);
      this.emitter.emit("subscribe");
    });

    this.subscription.on("unsubscribed", () => {
      this.logger.log(`Unsubscribed from ${this.name}`);
      this.emitter.emit("unsubscribe");
    });

    this.subscription.on("error", (ctx) => {
      this.emitter.emit("error", new Error(ctx.error.message));
    });
  }

  on<K extends keyof ChannelEvents>(
    event: K,
    callback: ChannelEvents[K],
  ): () => void {
    return this.emitter.on(event, callback);
  }

  off<K extends keyof ChannelEvents>(
    event: K,
    callback: ChannelEvents[K],
  ): void {
    this.emitter.off(event, callback);
  }

  listen(event: string, callback: RealtimeEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    this.subscribe();
    return () => this.stopListening(event, callback);
  }

  stopListening(event: string, callback: RealtimeEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  subscribe(): void {
    if (this.hasSubscribeBeenRequested) return;
    this.hasSubscribeBeenRequested = true;
    this.subscription.subscribe();
  }

  unsubscribe(): void {
    this.hasSubscribeBeenRequested = false;
    this.subscription.unsubscribe();
  }

  async history(limit?: number): Promise<unknown[]> {
    const result = await this.subscription.history({
      limit: limit ?? 10,
    });
    return result.publications.map((p) => p.data);
  }

  protected emitPublication(payload: unknown): void {
    this.emitter.emit("message", payload);
    this.dispatchNamedEvent(payload);
  }

  protected dispatchNamedEvent(payload: unknown): void {
    if (!isRealtimeEnvelope(payload)) return;

    const listeners = this.eventListeners.get(payload.event);
    if (!listeners) return;

    listeners.forEach((callback) => {
      callback(payload.data, payload);
    });
  }
}

export function isRealtimeEnvelope(payload: unknown): payload is RealtimePublicationEnvelope {
  return (
    payload !== null &&
    typeof payload === "object" &&
    "event" in payload &&
    typeof (payload as { event?: unknown }).event === "string" &&
    "data" in payload
  );
}
