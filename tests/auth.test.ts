import { describe, it, expect, vi, afterEach } from "vitest";
import { AuthManager } from "../src/auth.js";
import { HttpClient } from "../src/http.js";
import { createLogger } from "../src/utils.js";

describe("AuthManager", () => {
  const logger = createLogger(false);
  const originalFetch = globalThis.fetch;

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
      { subscriberId: "user_1" },
    );
  });

  it("fetches subscribe token via HTTP client", async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({ token: "sub_jwt" }),
    } as unknown as HttpClient;

    const auth = new AuthManager({ httpClient, logger });
    const token = await auth.getSubscribeToken("room:123", "user_1");

    expect(token).toBe("sub_jwt");
    expect(httpClient.post).toHaveBeenCalledWith(
      "/v1/realtime/tokens/subscribe",
      { channel: "room:123", subscriberId: "user_1" },
    );
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
        body: JSON.stringify({ type: "connect", subscriberId: "user_1" }),
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
