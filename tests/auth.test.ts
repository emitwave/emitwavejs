import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthManager } from "../src/auth.js";
import { EmitWaveError } from "../src/errors.js";
import { HttpClient } from "../src/http.js";
import { createLogger } from "../src/utils.js";

describe("AuthManager", () => {
  const logger = createLogger(false);
  const originalFetch = globalThis.fetch;

  function jwtWithClaims(claims: Record<string, unknown>): string {
    return `header.${btoa(JSON.stringify(claims))}.signature`;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches connect token via HTTP client", async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({ token: "connect_jwt" }),
    } as unknown as HttpClient;

    const auth = new AuthManager({ httpClient, logger });
    const token = await auth.getConnectToken("user_1");

    expect(token).toBe("connect_jwt");
    expect(httpClient.post).toHaveBeenCalledWith(
      "/v1/realtime/tokens/connect",
      { externalId: "user_1" },
    );
  });

  it("fetches subscribe token via HTTP client", async () => {
    // Create a fake JWT with a channel claim in the payload
    const payload = btoa(JSON.stringify({ channel: "org:room:123" }));
    const fakeJwt = `header.${payload}.signature`;

    const httpClient = {
      post: vi.fn().mockResolvedValue({ token: fakeJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({ httpClient, logger });
    const result = await auth.getSubscribeToken("room:123", "user_1");

    expect(result).toStrictEqual({ token: fakeJwt, channel: "org:room:123" });
    expect(httpClient.post).toHaveBeenCalledWith(
      "/v1/realtime/tokens/subscribe",
      { channel: "room:123", subscriberId: "user_1" },
    );
  });

  it("authorizes private channel with subscriber access token", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn().mockResolvedValue({ auth: fakeJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "subscriber_access_jwt",
    });
    const result = await auth.getPrivateSubscribeToken("private-user.user_1", "", "client-123");

    expect(result).toStrictEqual({
      token: fakeJwt,
      channel: "app:org.app.private-user.user_1",
    });
    expect(httpClient.postWithBearer).toHaveBeenCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "subscriber_access_jwt",
    );
  });

  it("authorizes protected presence channel data", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.presence-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn().mockResolvedValue({
        auth: fakeJwt,
        channel_data: JSON.stringify({ user_id: "user_1" }),
      }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "subscriber_access_jwt",
    });
    const result = await auth.getProtectedSubscribeToken("presence-user.user_1", "", "client-123");

    expect(result).toStrictEqual({
      token: fakeJwt,
      channel: "app:org.app.presence-user.user_1",
      channelData: JSON.stringify({ user_id: "user_1" }),
    });
  });

  it("authorizes encrypted private channel shared secret", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-encrypted-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn().mockResolvedValue({
        auth: fakeJwt,
        shared_secret: "secret",
      }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "subscriber_access_jwt",
    });
    const result = await auth.getProtectedSubscribeToken("private-encrypted-user.user_1", "", "client-123");

    expect(result).toStrictEqual({
      token: fakeJwt,
      channel: "app:org.app.private-encrypted-user.user_1",
      sharedSecret: "secret",
    });
  });

  it("requires subscriber access token for protected channel auth", async () => {
    const httpClient = {
      postWithBearer: vi.fn(),
    } as unknown as HttpClient;

    const auth = new AuthManager({ httpClient, logger });

    await expect(
      auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123"),
    ).rejects.toThrow(
      "subscriberAccessToken is required for protected channels",
    );
    expect(httpClient.postWithBearer).not.toHaveBeenCalled();
  });

  it("requires socket ID for protected channel auth", async () => {
    const httpClient = {
      postWithBearer: vi.fn(),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "subscriber_access_jwt",
    });

    await expect(auth.getProtectedSubscribeToken("private-user.user_1", "user_1")).rejects.toThrow(
      "socketId is required",
    );
    expect(httpClient.postWithBearer).not.toHaveBeenCalled();
  });

  it("uses subscriber access token set after construction", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn().mockResolvedValue({ auth: fakeJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({ httpClient, logger });
    auth.setSubscriberTokens({ accessToken: "new_access" });
    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(fakeJwt);
    expect(httpClient.postWithBearer).toHaveBeenCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "new_access",
    );
  });

  it("refreshes subscriber token before protected channel auth when access token is missing", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postNoAuth: vi.fn().mockResolvedValue({
        accessToken: "new_access",
        refreshToken: "new_refresh",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshExpiresIn: 2592000,
      }),
      postWithBearer: vi.fn().mockResolvedValue({ auth: fakeJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberRefreshToken: "old_refresh",
    });
    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(fakeJwt);
    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/refresh",
      { refreshToken: "old_refresh" },
    );
    expect(httpClient.postWithBearer).toHaveBeenCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "new_access",
    );
  });

  it("refreshes subscriber token before protected channel auth when access token is expired", async () => {
    const authPayload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const protectedJwt = `header.${authPayload}.signature`;
    const expiredAccessToken = jwtWithClaims({ exp: Math.floor(Date.now() / 1000) - 60 });
    const httpClient = {
      postNoAuth: vi.fn().mockResolvedValue({
        accessToken: "new_access",
        refreshToken: "new_refresh",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshExpiresIn: 2592000,
      }),
      postWithBearer: vi.fn().mockResolvedValue({ auth: protectedJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: expiredAccessToken,
      subscriberRefreshToken: "old_refresh",
    });

    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(protectedJwt);
    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/refresh",
      { refreshToken: "old_refresh" },
    );
    expect(httpClient.postWithBearer).toHaveBeenCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "new_access",
    );
  });

  it("does not refresh subscriber token before protected channel auth when access token is still valid", async () => {
    const authPayload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const protectedJwt = `header.${authPayload}.signature`;
    const validAccessToken = jwtWithClaims({ exp: Math.floor(Date.now() / 1000) + 600 });
    const httpClient = {
      postNoAuth: vi.fn(),
      postWithBearer: vi.fn().mockResolvedValue({ auth: protectedJwt }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: validAccessToken,
      subscriberRefreshToken: "old_refresh",
    });

    await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(httpClient.postNoAuth).not.toHaveBeenCalled();
    expect(httpClient.postWithBearer).toHaveBeenCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      validAccessToken,
    );
  });

  it("refreshes subscriber token manually", async () => {
    const httpClient = {
      postNoAuth: vi.fn().mockResolvedValue({
        accessToken: "new_access",
        refreshToken: "new_refresh",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshExpiresIn: 2592000,
      }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberRefreshToken: "old_refresh",
    });
    const result = await auth.refreshSubscriberToken();

    expect(result.accessToken).toBe("new_access");
    expect(result.refreshToken).toBe("new_refresh");
    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/refresh",
      { refreshToken: "old_refresh" },
    );
  });

  it("revokes subscriber token manually", async () => {
    const httpClient = {
      postNoAuth: vi.fn().mockResolvedValue({ status: "revoked" }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "old_access",
      subscriberRefreshToken: "old_refresh",
    });

    await auth.revokeSubscriberToken();

    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/revoke",
      { refreshToken: "old_refresh" },
    );
    expect(auth.hasSubscriberAccessToken()).toBe(false);
  });

  it("refreshes subscriber tokens and retries protected channel auth once on 401", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn()
        .mockRejectedValueOnce(new EmitWaveError("Unauthorized", "UNAUTHORIZED", 401))
        .mockResolvedValueOnce({ auth: fakeJwt }),
      postNoAuth: vi.fn().mockResolvedValue({
        accessToken: "next_access",
        refreshToken: "next_refresh",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshExpiresIn: 2592000,
      }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "old_access",
      subscriberRefreshToken: "old_refresh",
    });

    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(fakeJwt);
    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/refresh",
      { refreshToken: "old_refresh" },
    );
    expect(httpClient.postWithBearer).toHaveBeenNthCalledWith(
      1,
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "old_access",
    );
    expect(httpClient.postWithBearer).toHaveBeenNthCalledWith(
      2,
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "next_access",
    );
  });

  it("refreshes subscriber tokens and retries protected channel auth when 401 error is not an EmitWaveError instance", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      postWithBearer: vi.fn()
        .mockRejectedValueOnce({ status: 401, message: "Unauthorized" })
        .mockResolvedValueOnce({ auth: fakeJwt }),
      postNoAuth: vi.fn().mockResolvedValue({
        accessToken: "next_access",
        refreshToken: "next_refresh",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshExpiresIn: 2592000,
      }),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "old_access",
      subscriberRefreshToken: "old_refresh",
    });

    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(fakeJwt);
    expect(httpClient.postNoAuth).toHaveBeenCalledWith(
      "/v1/subscriber/token/refresh",
      { refreshToken: "old_refresh" },
    );
    expect(httpClient.postWithBearer).toHaveBeenLastCalledWith(
      "/v1/subscriber/broadcasting/auth",
      { socketId: "client-123", channelName: "private-user.user_1" },
      "next_access",
    );
  });

  it("does not refresh protected channel auth failures without a refresh token", async () => {
    const httpClient = {
      postWithBearer: vi.fn().mockRejectedValue(new EmitWaveError("Unauthorized", "UNAUTHORIZED", 401)),
      postNoAuth: vi.fn(),
    } as unknown as HttpClient;

    const auth = new AuthManager({
      httpClient,
      logger,
      subscriberAccessToken: "old_access",
    });

    await expect(
      auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123"),
    ).rejects.toThrow("Unauthorized");
    expect(httpClient.postNoAuth).not.toHaveBeenCalled();
  });

  it("uses authEndpoint when provided", async () => {
    const httpClient = {
      post: vi.fn(),
    } as unknown as HttpClient;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "custom_jwt" }),
    });

    const auth = new AuthManager({
      httpClient,
      authEndpoint: "https://my-backend.com/auth",
      logger,
    });

    const token = await auth.getConnectToken("user_1");

    expect(token).toBe("custom_jwt");
    expect(httpClient.post).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://my-backend.com/auth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "connect", subscriberExternalId: "user_1" }),
      }),
    );
  });

  it("uses subscriberExternalId for authEndpoint subscribe token requests", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.news" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      post: vi.fn(),
    } as unknown as HttpClient;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: fakeJwt }),
    });

    const auth = new AuthManager({
      httpClient,
      authEndpoint: "https://my-backend.com/auth",
      logger,
    });

    const result = await auth.getSubscribeToken("news", "user_1");

    expect(result.token).toBe(fakeJwt);
    expect(httpClient.post).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://my-backend.com/auth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "subscribe", channel: "news", subscriberExternalId: "user_1" }),
      }),
    );
  });

  it("uses authEndpoint for protected channel auth", async () => {
    const payload = btoa(JSON.stringify({ channel: "app:org.app.private-user.user_1" }));
    const fakeJwt = `header.${payload}.signature`;
    const httpClient = {
      post: vi.fn(),
    } as unknown as HttpClient;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auth: fakeJwt }),
    });

    const auth = new AuthManager({
      httpClient,
      authEndpoint: "https://my-backend.com/auth",
      logger,
      subscriberAccessToken: "subscriber_access_jwt",
    });

    const result = await auth.getProtectedSubscribeToken("private-user.user_1", "user_1", "client-123");

    expect(result.token).toBe(fakeJwt);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://my-backend.com/auth",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "protectedSubscribe",
          channel: "private-user.user_1",
          socketId: "client-123",
          subscriberExternalId: "user_1",
        }),
      }),
    );
  });

  it("throws on auth endpoint failure", async () => {
    const httpClient = {
      post: vi.fn(),
    } as unknown as HttpClient;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const auth = new AuthManager({
      httpClient,
      authEndpoint: "https://my-backend.com/auth",
      logger,
    });

    await expect(auth.getConnectToken("user_1")).rejects.toThrow(
      "Auth endpoint returned 500",
    );
  });
});
