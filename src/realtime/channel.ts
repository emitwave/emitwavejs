import type { Subscription } from "centrifuge";
import { TypedEmitter } from "../emitter.js";
import type { ChannelEvents } from "../types.js";
import type { Logger } from "../utils.js";

export class Channel {
  readonly name: string;
  protected emitter: TypedEmitter<ChannelEvents>;
  protected subscription: Subscription;
  protected logger: Logger;

  constructor(name: string, subscription: Subscription, logger: Logger) {
    this.name = name;
    this.subscription = subscription;
    this.logger = logger;
    this.emitter = new TypedEmitter<ChannelEvents>();
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
}
