import { HttpClient } from "./http.js";
import type { Logger } from "./utils.js";

interface TokenResponse {
  token: string;
}

export interface AuthManagerConfig {
  httpClient: HttpClient;
  authEndpoint?: string;
  logger: Logger;
}

export class AuthManager {
  private httpClient: HttpClient;
  private authEndpoint?: string;
  private logger: Logger;

  constructor(config: AuthManagerConfig) {
    this.httpClient = config.httpClient;
    this.authEndpoint = config.authEndpoint;
    this.logger = config.logger;
  }

  async getConnectToken(subscriberId: string): Promise<string> {
    this.logger.log("Fetching connect token for", subscriberId);

    if (this.authEndpoint) {
      return this.fetchFromAuthEndpoint("connect", { subscriberId });
    }

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/connect",
      { subscriberId },
    );
    return result.token;
  }

  async getSubscribeToken(
    channel: string,
    subscriberId: string,
  ): Promise<string> {
    this.logger.log("Fetching subscribe token for", channel);

    if (this.authEndpoint) {
      return this.fetchFromAuthEndpoint("subscribe", {
        channel,
        subscriberId,
      });
    }

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/subscribe",
      { channel, subscriberId },
    );
    return result.token;
  }

  private async fetchFromAuthEndpoint(
    type: "connect" | "subscribe",
    body: Record<string, string>,
  ): Promise<string> {
    const response = await fetch(this.authEndpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...body }),
    });

    if (!response.ok) {
      throw new Error(
        `Auth endpoint returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.token;
  }
}
