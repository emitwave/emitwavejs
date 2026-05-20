import type { Subscription } from "centrifuge";
import { TypedEmitter } from "../emitter.js";
import type { PresenceEvents, PresenceInfo } from "../types.js";
import type { Logger } from "../utils.js";

export class PresenceChannel {
  readonly name: string;
  private emitter = new TypedEmitter<PresenceEvents>();
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
      });
    });

    this.subscription.on("leave", (ctx) => {
      this.emitter.emit("leave", {
        clientId: ctx.info.client,
        userId: ctx.info.user,
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

  subscribe(): void {
    this.subscription.subscribe();
  }

  unsubscribe(): void {
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
    }));
  }
}
