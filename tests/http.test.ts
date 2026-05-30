import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../src/http.js";
import { EmitWaveError } from "../src/errors.js";

describe("HttpClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: () => Promise.resolve(body),
    });
  }

  it("post sends correct request", async () => {
    mockFetch(200, { token: "jwt_123" });
    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      apiKey: "ew_pk_test",
    });

    const result = await client.post<{ token: string }>(
      "/v1/realtime/tokens/connect",
      { externalId: "user_1" },
    );

    expect(result).toEqual({ token: "jwt_123" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/realtime/tokens/connect",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ew_pk_test",
          "X-Emitwave-SDK": "js/0.1.0",
        },
        body: JSON.stringify({ external_id: "user_1" }),
      }),
    );
  });

  it("get sends correct request with params", async () => {
    mockFetch(200, { data: [] });
    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      apiKey: "ew_pk_test",
    });

    await client.get("/v1/channels/test/history", { limit: 10 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/channels/test/history?limit=10",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws EmitWaveError on API error", async () => {
    mockFetch(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
      request_id: "req_1",
    });

    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      apiKey: "bad_key",
    });

    await expect(
      client.post("/v1/realtime/tokens/connect", {}),
    ).rejects.toThrow(EmitWaveError);
  });

  it("throws EmitWaveError on non-JSON error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    });

    const client = new HttpClient({
      baseUrl: "https://api.example.com",
      apiKey: "ew_pk_test",
    });

    await expect(
      client.post("/v1/realtime/tokens/connect", {}),
    ).rejects.toThrow("HTTP 500");
  });
});
