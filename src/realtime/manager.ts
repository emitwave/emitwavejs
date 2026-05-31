import { Centrifuge } from "centrifuge";
import type { AuthManager, ProtectedSubscribeTokenResponse } from "../auth.js";
import { TypedEmitter } from "../emitter.js";
import type { ConnectionState, EmitWaveEvents } from "../types.js";
import {
  hasProtectedPrefix,
  isEncryptedPrivateChannelName,
  toLogicalChannelName,
  toEncryptedPrivateChannelName,
  toPresenceChannelName,
  toPrivateChannelName,
  validateChannelName,
} from "../utils.js";
import type { Logger } from "../utils.js";
import { Channel } from "./channel.js";
import { EncryptedPrivateChannel } from "./encrypted-private.js";
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
  private subscriberExternalId: string | null = null;
  private socketId: string | null = null;
  private config: RealtimeManagerConfig;
  private _state: ConnectionState = "disconnected";

  readonly emitter = new TypedEmitter<EmitWaveEvents>();

  constructor(config: RealtimeManagerConfig) {
    this.config = config;
  }

  get state(): ConnectionState {
    return this._state;
  }

  async connect(subscriberExternalId?: string): Promise<void> {
    if (this.client) {
      this.config.logger.warn("Already connected, disconnecting first");
      this.disconnect();
    }

    this.subscriberExternalId = subscriberExternalId ?? null;
    this.socketId = null;
    this._state = "connecting";
    this.emitter.emit("connecting");

    const token = await this.config.authManager.getConnectToken(subscriberExternalId);

    this.client = new Centrifuge(this.config.realtimeUrl, {
      token,
      getToken: () =>
        this.config.authManager.getConnectToken(this.subscriberExternalId ?? undefined),
    });

    const connectedPromise = new Promise<void>((resolve, reject) => {
      let initialConnectSettled = false;

      this.client!.on("connected", (ctx) => {
        this.socketId = ctx.client;
        this._state = "connected";
        this.config.logger.log("Connected", ctx.client);
        this.emitter.emit("connected");
        if (!initialConnectSettled) {
          initialConnectSettled = true;
          resolve();
        }
      });

      this.client!.on("disconnected", (ctx) => {
        this.socketId = null;
        this._state = "disconnected";
        this.config.logger.log("Disconnected");
        this.emitter.emit("disconnected");
        if (!initialConnectSettled) {
          initialConnectSettled = true;
          reject(new Error(ctx.reason || "Disconnected before connection was established"));
        }
      });

      this.client!.on("error", (ctx) => {
        const error = new Error(ctx.error.message);
        this.config.logger.error("Connection error:", ctx.error);
        this.emitter.emit("error", error);
        if (!initialConnectSettled) {
          initialConnectSettled = true;
          reject(error);
        }
      });
    });

    this.client.connect();
    await connectedPromise;
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
    this.socketId = null;
    this._state = "disconnected";
  }

  isConnected(): boolean {
    return this._state === "connected";
  }

  async channel(name: string): Promise<Channel | PresenceChannel> {
    validateChannelName(name);
    if (hasProtectedPrefix(name)) {
      const logicalName = toLogicalChannelName(name);
      const method = name.startsWith("presence-")
        ? "presence"
        : isEncryptedPrivateChannelName(name)
          ? "encryptedPrivate"
          : "private";
      throw new Error(`This is a protected channel. Use ${method}("${logicalName}") instead of channel().`);
    }

    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    const { subscription } = await this.createSubscription(name, "public");
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

    const { subscription } = await this.createSubscription(backendName, "private", name);
    const channel = new Channel(name, subscription, this.config.logger);
    this.channels.set(name, channel);
    return channel;
  }

  async encryptedPrivate(name: string): Promise<EncryptedPrivateChannel> {
    validateChannelName(name);
    const backendName = toEncryptedPrivateChannelName(name);

    if (this.channels.has(name)) {
      const channel = this.channels.get(name)!;
      if (channel instanceof EncryptedPrivateChannel) return channel;
      throw new Error(`Channel ${name} already exists with a different type.`);
    }

    const { subscription, sharedSecret } = await this.createSubscription(
      backendName,
      "encrypted_private",
      name,
    );
    if (!sharedSecret) {
      throw new Error("shared_secret is required for encrypted private channels");
    }

    const channel = new EncryptedPrivateChannel(
      name,
      subscription,
      this.config.logger,
      sharedSecret,
    );
    this.channels.set(name, channel);
    return channel;
  }

  async presence(name: string): Promise<PresenceChannel> {
    validateChannelName(name);
    const backendName = toPresenceChannelName(name);

    if (this.presenceChannels.has(name)) {
      return this.presenceChannels.get(name)!;
    }

    const { subscription } = await this.createSubscription(backendName, "presence", name);
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
    mode: "public" | "private" | "presence" | "encrypted_private",
    logicalName = name,
  ) {
    if (!this.client) {
      throw new Error(
        "Not connected. Call connect() before creating channels.",
      );
    }

    const isProtected = mode === "private" || mode === "presence" || mode === "encrypted_private";

    if (isProtected && !this.config.authManager.hasSubscriberAccessToken()) {
      throw new Error(
        "subscriberAccessToken is required for protected channels. Provide it in config, connect() options, or setSubscriberTokens().",
      );
    }
    if (isProtected && !this.subscriberExternalId) {
      throw new Error(
        "subscriberExternalId is required for protected channels. Provide it in config or connect() options.",
      );
    }
    if (isProtected && !this.socketId) {
      throw new Error(
        "Protected channels require an active socket connection. Wait for the connected event before subscribing.",
      );
    }

    const authResult: ProtectedSubscribeTokenResponse = isProtected
      ? await this.config.authManager.getProtectedSubscribeToken(
          name,
          this.subscriberExternalId || "",
          this.socketId || "",
        )
      : await this.config.authManager.getSubscribeToken(
          name,
          this.subscriberExternalId || "",
        );
    const { token, channel: internalName } = authResult;

    this.internalNames.set(logicalName, internalName);

    const existing = this.client.getSubscription(internalName);
    if (existing) {
      return { subscription: existing, sharedSecret: authResult.sharedSecret };
    }

    return {
      subscription: this.client.newSubscription(internalName, {
        token,
        getToken: async () => {
          if (isProtected && !this.socketId) {
            throw new Error(
              "Protected channels require an active socket connection. Wait for the connected event before refreshing the subscription token.",
            );
          }
          const result = isProtected
            ? await this.config.authManager.getProtectedSubscribeToken(
                name,
                this.subscriberExternalId || "",
                this.socketId || "",
              )
            : await this.config.authManager.getSubscribeToken(
                name,
                this.subscriberExternalId || "",
              );
          return result.token;
        },
      }),
      sharedSecret: authResult.sharedSecret,
    };
  }
}
