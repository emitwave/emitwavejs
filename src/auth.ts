import { HttpClient } from "./http.js";
import type { Logger } from "./utils.js";
import { decodeJwtPayload } from "./utils.js";

interface TokenResponse {
  token: string;
}

interface SubscribeTokenResponse {
  token: string;
  channel: string;
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

  async getConnectToken(subscriberId?: string): Promise<string> {
    this.logger.log("Fetching connect token", subscriberId ? `for ${subscriberId}` : "(anonymous)");

    if (this.authEndpoint) {
      return this.fetchFromAuthEndpoint("connect", subscriberId ? { subscriberId } : {});
    }

    const body: Record<string, string> = {};
    if (subscriberId) body.subscriberId = subscriberId;

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/connect",
      body,
    );
    return result.token;
  }

  async getSubscribeToken(
    channel: string,
    subscriberId: string = "",
  ): Promise<SubscribeTokenResponse> {
    this.logger.log("Fetching subscribe token for", channel);

    let token: string;

    const body: Record<string, string> = { channel };
    if (subscriberId) body.subscriberId = subscriberId;

    if (this.authEndpoint) {
      token = await this.fetchFromAuthEndpoint("subscribe", body);
    } else {
      const result = await this.httpClient.post<TokenResponse>(
        "/v1/realtime/tokens/subscribe",
        body,
      );
      token = result.token;
    }

    const claims = decodeJwtPayload(token);
    const internalChannel = claims.channel as string;
    return { token, channel: internalChannel };
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
