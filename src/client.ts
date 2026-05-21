import type {
  EmitWaveConfig,
  EmitWaveEvents,
  ConnectOptions,
} from "./types.js";
import { HttpClient } from "./http.js";
import { AuthManager } from "./auth.js";
import { RealtimeManager } from "./realtime/manager.js";
import { createLogger } from "./utils.js";
import type { Channel } from "./realtime/channel.js";
import type { PresenceChannel } from "./realtime/presence.js";

const DEFAULT_API_URL = "https://api.emitwave.com";
const DEFAULT_REALTIME_URL =
  "wss://rt.emitwave.com/connection/websocket";

export class EmitWave {
  private realtimeManager: RealtimeManager;
  private subscriberId?: string;

  constructor(config: EmitWaveConfig) {
    if (!config.appId) throw new Error("appId is required");
    if (!config.publicKey) throw new Error("publicKey is required");

    if (config.publicKey.startsWith("ew_sk_")) {
      console.warn(
        "[EmitWave] WARNING: You are using a secret key in the client. " +
          "Use a public key (ew_pk_) instead to avoid exposing your secret.",
      );
    }

    const logger = createLogger(config.debug ?? false);
    const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    const realtimeUrl = config.realtimeUrl ?? DEFAULT_REALTIME_URL;

    const httpClient = new HttpClient({
      baseUrl: apiUrl,
      apiKey: config.publicKey,
    });

    const authManager = new AuthManager({
      httpClient,
      authEndpoint: config.authEndpoint,
      logger,
    });

    this.subscriberId = config.subscriberId;

    this.realtimeManager = new RealtimeManager({
      realtimeUrl,
      authManager,
      logger,
    });
  }

  async connect(options?: ConnectOptions): Promise<void> {
    const subscriberId = options?.subscriberId ?? this.subscriberId;
    await this.realtimeManager.connect(subscriberId);
  }

  disconnect(): void {
    this.realtimeManager.disconnect();
  }

  isConnected(): boolean {
    return this.realtimeManager.isConnected();
  }

  async channel(name: string): Promise<Channel | PresenceChannel> {
    return this.realtimeManager.channel(name);
  }

  async presence(name: string): Promise<PresenceChannel> {
    return this.realtimeManager.presence(name);
  }

  on<K extends keyof EmitWaveEvents>(
    event: K,
    callback: EmitWaveEvents[K],
  ): () => void {
    return this.realtimeManager.emitter.on(event, callback);
  }

  off<K extends keyof EmitWaveEvents>(
    event: K,
    callback: EmitWaveEvents[K],
  ): void {
    this.realtimeManager.emitter.off(event, callback);
  }
}
