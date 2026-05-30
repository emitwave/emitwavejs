import { describe, it, expect, vi, beforeEach } from "vitest";
import { RealtimeManager } from "../../src/realtime/manager.js";
import type { AuthManager } from "../../src/auth.js";
import { createLogger } from "../../src/utils.js";

// Mock centrifuge module
const mockSubscription = {
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  history: vi.fn(),
  presence: vi.fn(),
};

const mockClient = {
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSubscription: vi.fn().mockReturnValue(mockSubscription),
  getSubscription: vi.fn().mockReturnValue(null),
  removeSubscription: vi.fn(),
};

vi.mock("centrifuge", () => ({
  Centrifuge: vi.fn().mockImplementation(() => mockClient),
}));

describe("RealtimeManager", () => {
  const logger = createLogger(false);
  let authManager: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    authManager = {
      getConnectToken: vi.fn().mockResolvedValue("connect_jwt"),
      getSubscribeToken: vi.fn().mockResolvedValue({ token: "sub_jwt", channel: "org:room" }),
      getPrivateSubscribeToken: vi.fn().mockResolvedValue({ token: "sub_jwt", channel: "org:private" }),
      getProtectedSubscribeToken: vi.fn().mockResolvedValue({ token: "sub_jwt", channel: "org:private" }),
      hasSubscriberAccessToken: vi.fn().mockReturnValue(true),
    } as unknown as AuthManager;
  });

  it("connects and creates Centrifuge client", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    expect(authManager.getConnectToken).toHaveBeenCalledWith("user_1");
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it("state is connecting after connect call", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    // State is "connecting" until the connected event fires
    expect(manager.state).toBe("connecting");
  });

  it("disconnect clears state", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    manager.disconnect();

    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(manager.state).toBe("disconnected");
    expect(manager.isConnected()).toBe(false);
  });

  it("channel creates and caches channel", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    const ch1 = await manager.channel("room-1");
    const ch2 = await manager.channel("room-1");

    expect(ch1).toBe(ch2);
    expect(mockClient.newSubscription).toHaveBeenCalledTimes(1);
  });

  it("routes presence channels through protected auth", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    await manager.presence("company.acme");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("presence-company.acme");
    expect(mockClient.newSubscription).toHaveBeenCalledWith(
      "org:private",
      expect.objectContaining({ token: "sub_jwt" }),
    );
  });

  it("throws if channel called before connect", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await expect(manager.channel("test")).rejects.toThrow("Not connected");
  });

  it("requires subscriber access token for private channels", async () => {
    authManager = {
      getConnectToken: vi.fn().mockResolvedValue("connect_jwt"),
      getSubscribeToken: vi.fn(),
      getPrivateSubscribeToken: vi.fn(),
      getProtectedSubscribeToken: vi.fn(),
      hasSubscriberAccessToken: vi.fn().mockReturnValue(false),
    } as unknown as AuthManager;
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();

    await expect(manager.private("user.user_1")).rejects.toThrow(
      "subscriberAccessToken is required",
    );
  });

  it("routes private channels through private auth", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();
    await manager.private("user.user_1");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-user.user_1");
    expect(mockClient.newSubscription).toHaveBeenCalledWith(
      "org:private",
      expect.objectContaining({ token: "sub_jwt" }),
    );
  });

  it("routes company private channels through private auth", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();
    await manager.private("company.acme");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-company.acme");
  });

  it("routes encrypted private channels through protected auth", async () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
    authManager = {
      getConnectToken: vi.fn().mockResolvedValue("connect_jwt"),
      getSubscribeToken: vi.fn(),
      getPrivateSubscribeToken: vi.fn(),
      getProtectedSubscribeToken: vi.fn().mockResolvedValue({
        token: "sub_jwt",
        channel: "org:encrypted",
        sharedSecret: key,
      }),
      hasSubscriberAccessToken: vi.fn().mockReturnValue(true),
    } as unknown as AuthManager;
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();
    await manager.encryptedPrivate("user.user_1");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-encrypted-user.user_1");
    expect(mockClient.newSubscription).toHaveBeenCalledWith(
      "org:encrypted",
      expect.objectContaining({ token: "sub_jwt" }),
    );
  });

  it("requires shared secret for encrypted private channels", async () => {
    authManager = {
      getConnectToken: vi.fn().mockResolvedValue("connect_jwt"),
      getSubscribeToken: vi.fn(),
      getPrivateSubscribeToken: vi.fn(),
      getProtectedSubscribeToken: vi.fn().mockResolvedValue({
        token: "sub_jwt",
        channel: "org:encrypted",
      }),
      hasSubscriberAccessToken: vi.fn().mockReturnValue(true),
    } as unknown as AuthManager;
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();

    await expect(manager.encryptedPrivate("user.user_1")).rejects.toThrow(
      "shared_secret is required",
    );
  });

  it("rejects protected prefixed names through public channel()", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();

    await expect(manager.channel("private-user.user_1")).rejects.toThrow(
      'Use private("user.user_1")',
    );
    await expect(manager.channel("private-encrypted-user.user_1")).rejects.toThrow(
      'Use encryptedPrivate("user.user_1")',
    );
    await expect(manager.channel("presence-user.user_1")).rejects.toThrow(
      'Use presence("user.user_1")',
    );
  });

  it("rejects protected prefixes in private()", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect();

    await expect(manager.private("private-user.user_1")).rejects.toThrow(
      'Use private("user.user_1")',
    );
  });
});
