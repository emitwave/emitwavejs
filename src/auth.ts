import { HttpClient } from "./http.js";
import type { SubscriberTokenPair } from "./types.js";
import type { Logger } from "./utils.js";
import { decodeJwtPayload } from "./utils.js";

interface TokenResponse {
  token: string;
}

interface SubscribeTokenResponse {
  token: string;
  channel: string;
}

interface BroadcastingAuthResponse {
  auth: string;
}

export interface AuthManagerConfig {
  httpClient: HttpClient;
  authEndpoint?: string;
  logger: Logger;
  subscriberAccessToken?: string;
  subscriberRefreshToken?: string;
}

export class AuthManager {
  private httpClient: HttpClient;
  private authEndpoint?: string;
  private logger: Logger;
  private subscriberAccessToken?: string;
  private subscriberRefreshToken?: string;

  constructor(config: AuthManagerConfig) {
    this.httpClient = config.httpClient;
    this.authEndpoint = config.authEndpoint;
    this.logger = config.logger;
    this.subscriberAccessToken = config.subscriberAccessToken;
    this.subscriberRefreshToken = config.subscriberRefreshToken;
  }

  setSubscriberTokens(tokens: {
    accessToken?: string;
    refreshToken?: string;
  }): void {
    if (tokens.accessToken !== undefined) {
      this.subscriberAccessToken = tokens.accessToken;
    }
    if (tokens.refreshToken !== undefined) {
      this.subscriberRefreshToken = tokens.refreshToken;
    }
  }

  hasSubscriberAccessToken(): boolean {
    return Boolean(this.subscriberAccessToken);
  }

  async issueSubscriberToken(subscriberId: string): Promise<SubscriberTokenPair> {
    const result = await this.httpClient.post<SubscriberTokenPair>(
      `/v1/subscribers/${encodeURIComponent(subscriberId)}/token`,
      {},
    );
    this.setSubscriberTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }

  async refreshSubscriberToken(refreshToken = this.subscriberRefreshToken): Promise<SubscriberTokenPair> {
    if (!refreshToken) {
      throw new Error("refreshToken is required to refresh subscriber tokens");
    }

    const result = await this.httpClient.postNoAuth<SubscriberTokenPair>(
      "/v1/subscriber/token/refresh",
      { refreshToken },
    );
    this.setSubscriberTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }

  async revokeSubscriberToken(refreshToken = this.subscriberRefreshToken): Promise<void> {
    if (!refreshToken) {
      throw new Error("refreshToken is required to revoke subscriber tokens");
    }

    await this.httpClient.postNoAuth<{ status: string }>(
      "/v1/subscriber/token/revoke",
      { refreshToken },
    );
    if (refreshToken === this.subscriberRefreshToken) {
      this.subscriberAccessToken = undefined;
      this.subscriberRefreshToken = undefined;
    }
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

    const body: Record<string, string> = { channel };
    if (subscriberId) body.subscriberId = subscriberId;

    if (this.authEndpoint) {
      const token = await this.fetchFromAuthEndpoint("subscribe", body);
      return this.subscribeTokenResult(token);
    }

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/subscribe",
      body,
    );
    return this.subscribeTokenResult(result.token);
  }

  async getPrivateSubscribeToken(channel: string): Promise<SubscribeTokenResponse> {
    this.logger.log("Fetching private subscribe token for", channel);
    const token = await this.getPrivateChannelToken(channel);
    return this.subscribeTokenResult(token);
  }

  private subscribeTokenResult(token: string): SubscribeTokenResponse {
    const claims = decodeJwtPayload(token);
    const internalChannel = claims.channel as string;
    return { token, channel: internalChannel };
  }

  private async getPrivateChannelToken(channel: string): Promise<string> {
    if (!this.subscriberAccessToken && this.subscriberRefreshToken) {
      await this.refreshSubscriberToken();
    }
    if (!this.subscriberAccessToken) {
      throw new Error(
        "subscriberAccessToken is required for private channels. Pass it in the EmitWave config, connect() options, or setSubscriberTokens().",
      );
    }

    const result = await this.httpClient.postWithBearer<BroadcastingAuthResponse>(
      "/v1/subscriber/broadcasting/auth",
      { channelName: channel },
      this.subscriberAccessToken,
    );
    return result.auth;
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
