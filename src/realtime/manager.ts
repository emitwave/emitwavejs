import { Centrifuge } from "centrifuge";
import type { AuthManager } from "../auth.js";
import { TypedEmitter } from "../emitter.js";
import type { ConnectionState, EmitWaveEvents } from "../types.js";
import {
  hasProtectedPrefix,
  toLogicalChannelName,
  toPresenceChannelName,
  toPrivateChannelName,
  validateChannelName,
} from "../utils.js";
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
  private internalNames = new Map<string, string>();
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

  async connect(subscriberId?: string): Promise<void> {
    if (this.client) {
      this.config.logger.warn("Already connected, disconnecting first");
      this.disconnect();
    }

    this.subscriberId = subscriberId ?? null;
    this._state = "connecting";
    this.emitter.emit("connecting");

    const token = await this.config.authManager.getConnectToken(subscriberId);

    this.client = new Centrifuge(this.config.realtimeUrl, {
      token,
      getToken: () =>
        this.config.authManager.getConnectToken(this.subscriberId ?? undefined),
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
      const internalName = this.internalNames.get(name) ?? name;
      const sub = this.client.getSubscription(internalName);
      if (sub) this.client.removeSubscription(sub);
    }
    for (const [name] of this.presenceChannels) {
      const internalName = this.internalNames.get(name) ?? name;
      const sub = this.client.getSubscription(internalName);
      if (sub) this.client.removeSubscription(sub);
    }
    this.channels.clear();
    this.presenceChannels.clear();
    this.internalNames.clear();

    this.client.disconnect();
    this.client = null;
    this._state = "disconnected";
  }

  isConnected(): boolean {
    return this._state === "connected";
  }

  async channel(name: string): Promise<Channel | PresenceChannel> {
    validateChannelName(name);
    if (hasProtectedPrefix(name)) {
      const logicalName = toLogicalChannelName(name);
      const method = name.startsWith("presence-") ? "presence" : "private";
      throw new Error(`This is a protected channel. Use ${method}("${logicalName}") instead of channel().`);
    }

    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const subscription = await this.createSubscription(name, "public");
    const channel = new Channel(name, subscription, this.config.logger);
    this.channels.set(name, channel);
    return channel;
  }

  async private(name: string): Promise<Channel> {
    validateChannelName(name);
    const backendName = toPrivateChannelName(name);

    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const subscription = await this.createSubscription(backendName, "private", name);
    const channel = new Channel(name, subscription, this.config.logger);
    this.channels.set(name, channel);
    return channel;
  }

  async presence(name: string): Promise<PresenceChannel> {
    validateChannelName(name);
    const backendName = toPresenceChannelName(name);

    if (this.presenceChannels.has(name)) {
      return this.presenceChannels.get(name)!;
    }

    const subscription = await this.createSubscription(backendName, "presence", name);
    const channel = new PresenceChannel(
      name,
      subscription,
      this.config.logger,
    );
    this.presenceChannels.set(name, channel);
    return channel;
  }

  private async createSubscription(
    name: string,
    mode: "public" | "private" | "presence",
    logicalName = name,
  ) {
    if (!this.client) {
      throw new Error(
        "Not connected. Call connect() before creating channels.",
      );
    }

    if (mode === "private" && !this.config.authManager.hasSubscriberAccessToken()) {
      throw new Error(
        "subscriberAccessToken is required for private channels. Provide it in config, connect() options, or setSubscriberTokens().",
      );
    }

    if (mode === "presence") {
      throw new Error(
        "Presence channels are not supported by subscriber private channel auth yet.",
      );
    }

    const { token, channel: internalName } = mode === "private"
      ? await this.config.authManager.getPrivateSubscribeToken(name)
      : await this.config.authManager.getSubscribeToken(
          name,
          this.subscriberId || "",
        );

    this.internalNames.set(logicalName, internalName);

    const existing = this.client.getSubscription(internalName);
    if (existing) return existing;

    return this.client.newSubscription(internalName, {
      token,
      getToken: async () => {
        const result = mode === "private"
          ? await this.config.authManager.getPrivateSubscribeToken(name)
          : await this.config.authManager.getSubscribeToken(
              name,
              this.subscriberId || "",
            );
        return result.token;
      },
    });
  }
}
