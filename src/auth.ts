import { HttpClient } from "./http.js";
import { EmitWaveError } from "./errors.js";
import type { SubscriberTokenPair } from "./types.js";
import type { Logger } from "./utils.js";
import { decodeJwtPayload } from "./utils.js";

const SUBSCRIBER_ACCESS_REFRESH_SKEW_SECONDS = 30;

interface TokenResponse {
  token: string;
}

interface SubscribeTokenResponse {
  token: string;
  channel: string;
}

export interface ProtectedSubscribeTokenResponse extends SubscribeTokenResponse {
  channelData?: string;
  sharedSecret?: string;
}

interface BroadcastingAuthResponse {
  auth: string;
  channel_data?: string;
  channelData?: string;
  shared_secret?: string;
  sharedSecret?: string;
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
    return Boolean(this.subscriberAccessToken || this.subscriberRefreshToken);
  }

  async refreshSubscriberToken(refreshToken = this.subscriberRefreshToken): Promise<SubscriberTokenPair> {
    if (!refreshToken) {
      throw new Error("refreshToken is required to refresh subscriber tokens");
    }

    this.logger.log("Refreshing subscriber access token");
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

  async getConnectToken(subscriberExternalId?: string): Promise<string> {
    this.logger.log("Fetching connect token", subscriberExternalId ? `for ${subscriberExternalId}` : "(anonymous)");

    if (this.authEndpoint) {
      return this.fetchFromAuthEndpoint("connect", subscriberExternalId ? { subscriberExternalId } : {});
    }

    const body: Record<string, string> = {};
    if (subscriberExternalId) body.externalId = subscriberExternalId;

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/connect",
      body,
    );
    return result.token;
  }

  async getSubscribeToken(
    channel: string,
    subscriberExternalId: string = "",
  ): Promise<SubscribeTokenResponse> {
    this.logger.log("Fetching subscribe token for", channel);

    const body: Record<string, string> = { channel };
    if (subscriberExternalId) body.subscriberId = subscriberExternalId;

    if (this.authEndpoint) {
      const token = await this.fetchFromAuthEndpoint(
        "subscribe",
        subscriberExternalId ? { channel, subscriberExternalId } : { channel },
      );
      return this.subscribeTokenResult(token);
    }

    const result = await this.httpClient.post<TokenResponse>(
      "/v1/realtime/tokens/subscribe",
      body,
    );
    return this.subscribeTokenResult(result.token);
  }

  async getPrivateSubscribeToken(
    channel: string,
    subscriberExternalId = "",
    socketId = "",
  ): Promise<ProtectedSubscribeTokenResponse> {
    this.logger.log("Fetching private subscribe token for", channel);
    return this.getProtectedSubscribeToken(channel, subscriberExternalId, socketId);
  }

  async getProtectedSubscribeToken(
    channel: string,
    subscriberExternalId = "",
    socketId = "",
  ): Promise<ProtectedSubscribeTokenResponse> {
    this.logger.log("Fetching protected subscribe token for", channel);
    const result = await this.getProtectedChannelAuth(channel, subscriberExternalId, socketId);
    const tokenResult = this.subscribeTokenResult(result.auth);
    const protectedResult: ProtectedSubscribeTokenResponse = { ...tokenResult };
    const channelData = result.channel_data ?? result.channelData;
    const sharedSecret = result.shared_secret ?? result.sharedSecret;
    if (channelData !== undefined) protectedResult.channelData = channelData;
    if (sharedSecret !== undefined) protectedResult.sharedSecret = sharedSecret;
    return protectedResult;
  }

  private subscribeTokenResult(token: string): SubscribeTokenResponse {
    const claims = decodeJwtPayload(token);
    const internalChannel = claims.channel as string;
    return { token, channel: internalChannel };
  }

  private async getProtectedChannelAuth(
    channel: string,
    subscriberExternalId = "",
    socketId = "",
  ): Promise<BroadcastingAuthResponse> {
    if (!socketId) {
      throw new Error("socketId is required for protected channel authorization");
    }
    if (!this.subscriberAccessToken && this.subscriberRefreshToken) {
      await this.refreshSubscriberToken();
    }
    if (this.subscriberAccessTokenExpired() && this.subscriberRefreshToken) {
      await this.refreshSubscriberToken();
    }
    if (!this.subscriberAccessToken) {
      throw new Error(
        "subscriberAccessToken is required for protected channels. Pass it in the EmitWave config, connect() options, or setSubscriberTokens().",
      );
    }

    if (this.authEndpoint) {
      return this.fetchProtectedFromAuthEndpoint(channel, subscriberExternalId, socketId);
    }

    try {
      return await this.requestProtectedChannelAuth(channel, socketId);
    } catch (err) {
      if (!this.shouldRefreshSubscriberToken(err)) {
        throw err;
      }

      await this.refreshSubscriberToken();
      return this.requestProtectedChannelAuth(channel, socketId);
    }
  }

  private requestProtectedChannelAuth(
    channel: string,
    socketId: string,
  ): Promise<BroadcastingAuthResponse> {
    return this.httpClient.postWithBearer<BroadcastingAuthResponse>(
      "/v1/subscriber/broadcasting/auth",
      { socketId, channelName: channel },
      this.subscriberAccessToken!,
    );
  }

  private shouldRefreshSubscriberToken(err: unknown): boolean {
    return errorStatus(err) === 401 && Boolean(this.subscriberRefreshToken);
  }

  private subscriberAccessTokenExpired(): boolean {
    if (!this.subscriberAccessToken) return false;

    try {
      const claims = decodeJwtPayload(this.subscriberAccessToken);
      if (typeof claims.exp !== "number") return false;
      const nowSeconds = Math.floor(Date.now() / 1000);
      return claims.exp <= nowSeconds + SUBSCRIBER_ACCESS_REFRESH_SKEW_SECONDS;
    } catch {
      return false;
    }
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

  private async fetchProtectedFromAuthEndpoint(
    channel: string,
    subscriberExternalId = "",
    socketId = "",
  ): Promise<BroadcastingAuthResponse> {
    const body: Record<string, string> = { type: "protectedSubscribe", channel, socketId };
    if (subscriberExternalId) body.subscriberExternalId = subscriberExternalId;

    const response = await fetch(this.authEndpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Auth endpoint returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (typeof data.auth === "string") {
      return data;
    }
    if (typeof data.token === "string") {
      return {
        auth: data.token,
        channelData: data.channelData,
        channel_data: data.channel_data,
        sharedSecret: data.sharedSecret,
        shared_secret: data.shared_secret,
      };
    }
    throw new Error("Auth endpoint must return auth for protected channels");
  }
}

function errorStatus(err: unknown): number | undefined {
  if (err instanceof EmitWaveError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}
