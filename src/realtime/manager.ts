import { Centrifuge } from "centrifuge";
import type { AuthManager } from "../auth.js";
import { TypedEmitter } from "../emitter.js";
import type { ConnectionState, EmitWaveEvents } from "../types.js";
import { validateChannelName, parseChannelType } from "../utils.js";
import type { Logger } from "../utils.js";
import { Channel } from "./channel.js";
import { PresenceChannel } from "./presence.js";

export interface RealtimeManagerConfig {
  realtimeUrl: string;
  authManager: AuthManager;
  logger: Logger;
}

export class RealtimeManager {
  private client: Centrifuge | null = null;
  private channels = new Map<string, Channel>();
  private presenceChannels = new Map<string, PresenceChannel>();
  private subscriberId: string | null = null;
  private config: RealtimeManagerConfig;
  private _state: ConnectionState = "disconnected";

  readonly emitter = new TypedEmitter<EmitWaveEvents>();

  constructor(config: RealtimeManagerConfig) {
    this.config = config;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(subscriberId: string): Promise<void> {
    if (this.client) {
      this.config.logger.warn("Already connected, disconnecting first");
      this.disconnect();
    }

    this.subscriberId = subscriberId;
    this._state = "connecting";
    this.emitter.emit("connecting");

    const token = await this.config.authManager.getConnectToken(subscriberId);

    this.client = new Centrifuge(this.config.realtimeUrl, {
      token,
      getToken: () =>
        this.config.authManager.getConnectToken(this.subscriberId!),
    });

    this.client.on("connected", () => {
      this._state = "connected";
      this.config.logger.log("Connected");
      this.emitter.emit("connected");
    });

    this.client.on("disconnected", () => {
      this._state = "disconnected";
      this.config.logger.log("Disconnected");
      this.emitter.emit("disconnected");
    });

    this.client.on("error", (ctx) => {
      this.config.logger.error("Connection error:", ctx.error);
      this.emitter.emit("error", new Error(ctx.error.message));
    });

    this.client.connect();
  }

  disconnect(): void {
    if (!this.client) return;

    for (const [name] of this.channels) {
      this.client.removeSubscription(
        this.client.getSubscription(name) ?? undefined as any,
      );
    }
    this.channels.clear();
    this.presenceChannels.clear();

    this.client.disconnect();
    this.client = null;
    this._state = "disconnected";
  }

  isConnected(): boolean {
    return this._state === "connected";
  }

  channel(name: string): Channel | PresenceChannel {
    validateChannelName(name);
    const type = parseChannelType(name);

    if (type === "presence") {
      return this.presence(name);
    }

    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const subscription = this.createSubscription(name);
    const channel = new Channel(name, subscription, this.config.logger);
    this.channels.set(name, channel);
    return channel;
  }

  presence(name: string): PresenceChannel {
    validateChannelName(name);

    if (this.presenceChannels.has(name)) {
      return this.presenceChannels.get(name)!;
    }

    const subscription = this.createSubscription(name);
    const channel = new PresenceChannel(
      name,
      subscription,
      this.config.logger,
    );
    this.presenceChannels.set(name, channel);
    return channel;
  }

  private createSubscription(name: string) {
    if (!this.client) {
      throw new Error(
        "Not connected. Call connect() before creating channels.",
      );
    }

    const existing = this.client.getSubscription(name);
    if (existing) return existing;

    const type = parseChannelType(name);

    if (type === "public") {
      return this.client.newSubscription(name, {});
    }

    return this.client.newSubscription(name, {
      getToken: () =>
        this.config.authManager.getSubscribeToken(
          name,
          this.subscriberId!,
        ),
    });
  }
}
