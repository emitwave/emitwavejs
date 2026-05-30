import type { Subscription } from "centrifuge";
import { TypedEmitter } from "../emitter.js";
import type {
  PresenceEvents,
  PresenceInfo,
  RealtimeEventCallback,
} from "../types.js";
import type { Logger } from "../utils.js";
import { isRealtimeEnvelope } from "./channel.js";

export class PresenceChannel {
  readonly name: string;
  private emitter = new TypedEmitter<PresenceEvents>();
  private eventListeners = new Map<string, Set<RealtimeEventCallback>>();
  private hasSubscribeBeenRequested = false;
  private subscription: Subscription;
  private logger: Logger;

  constructor(name: string, subscription: Subscription, logger: Logger) {
    this.name = name;
    this.subscription = subscription;
    this.logger = logger;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.subscription.on("publication", (ctx) => {
      this.emitter.emit("message", ctx.data);
      this.dispatchNamedEvent(ctx.data);
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

    this.subscription.on("join", (ctx) => {
      this.emitter.emit("join", {
        clientId: ctx.info.client,
        userId: ctx.info.user,
        info: ctx.info,
      });
    });

    this.subscription.on("leave", (ctx) => {
      this.emitter.emit("leave", {
        clientId: ctx.info.client,
        userId: ctx.info.user,
        info: ctx.info,
      });
    });
  }

  on<K extends keyof PresenceEvents>(
    event: K,
    callback: PresenceEvents[K],
  ): () => void {
    return this.emitter.on(event, callback);
  }

  off<K extends keyof PresenceEvents>(
    event: K,
    callback: PresenceEvents[K],
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

  async members(): Promise<PresenceInfo[]> {
    const result = await this.subscription.presence();
    return Object.values(result.clients).map((info) => ({
      clientId: info.client,
      userId: info.user,
      info,
    }));
  }

  private dispatchNamedEvent(payload: unknown): void {
    if (!isRealtimeEnvelope(payload)) return;

    const listeners = this.eventListeners.get(payload.event);
    if (!listeners) return;

    listeners.forEach((callback) => {
      callback(payload.data, payload);
    });
  }
}
