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

  function emitConnected(client = "client-123") {
    const handler = mockClient.on.mock.calls.find(([event]) => event === "connected")?.[1];
    if (!handler) throw new Error("connected handler was not registered");
    handler({ client });
  }

  function emitDisconnected(reason = "transport closed") {
    const handler = mockClient.on.mock.calls.find(([event]) => event === "disconnected")?.[1];
    if (!handler) throw new Error("disconnected handler was not registered");
    handler({ reason });
  }

  function emitError(message = "connection failed") {
    const handler = mockClient.on.mock.calls.find(([event]) => event === "error")?.[1];
    if (!handler) throw new Error("error handler was not registered");
    handler({ error: { message } });
  }

  async function connectManager(manager: RealtimeManager, subscriberExternalId?: string) {
    const promise = manager.connect(subscriberExternalId);
    await Promise.resolve();
    emitConnected();
    await promise;
  }

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

    const connectPromise = manager.connect("user_1");
    await Promise.resolve();
    expect(authManager.getConnectToken).toHaveBeenCalledWith("user_1");
    expect(mockClient.connect).toHaveBeenCalled();
    emitConnected();
    await connectPromise;
  });

  it("connect resolves after the connected event provides the socket ID", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    let resolved = false;
    const connectPromise = manager.connect("user_1").then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(manager.state).toBe("connecting");
    expect(resolved).toBe(false);

    emitConnected("client-123");
    await connectPromise;

    expect(manager.state).toBe("connected");
    expect(resolved).toBe(true);
  });

  it("rejects connect if the connection errors before the first connected event", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    const connectPromise = manager.connect("user_1");
    await Promise.resolve();
    emitError("bad token");

    await expect(connectPromise).rejects.toThrow("bad token");
  });

  it("rejects connect if the connection disconnects before the first connected event", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    const connectPromise = manager.connect("user_1");
    await Promise.resolve();
    emitDisconnected("closed before connect");

    await expect(connectPromise).rejects.toThrow("closed before connect");
  });

  it("disconnect clears state", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await connectManager(manager, "user_1");
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

    await connectManager(manager, "user_1");
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

    await connectManager(manager, "user_1");
    await manager.presence("company.acme");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("presence-company.acme", "user_1", "client-123");
    expect(mockClient.newSubscription).toHaveBeenCalledWith(
      "org:private",
      expect.objectContaining({ token: "sub_jwt" }),
    );
  });

  it("routes user presence channels through protected auth", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await connectManager(manager, "user_1");
    await manager.presence("user.user_1");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("presence-user.user_1", "user_1", "client-123");
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

    await connectManager(manager, "user_1");

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

    await connectManager(manager, "user_1");
    await manager.private("user.user_1");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-user.user_1", "user_1", "client-123");
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

    await connectManager(manager, "user_1");
    await manager.private("company.acme");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-company.acme", "user_1", "client-123");
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

    await connectManager(manager, "user_1");
    await manager.encryptedPrivate("user.user_1");

    expect(authManager.getProtectedSubscribeToken).toHaveBeenCalledWith("private-encrypted-user.user_1", "user_1", "client-123");
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

    await connectManager(manager, "user_1");

    await expect(manager.encryptedPrivate("user.user_1")).rejects.toThrow(
      "shared_secret is required",
    );
  });

  it("requires subscriberExternalId for protected channels", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await connectManager(manager);

    await expect(manager.private("user.user_1")).rejects.toThrow(
      "subscriberExternalId is required",
    );
  });

  it("rejects protected prefixed names through public channel()", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await connectManager(manager);

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

    await connectManager(manager);

    await expect(manager.private("private-user.user_1")).rejects.toThrow(
      'Use private("user.user_1")',
    );
  });

  it("requires the connected socket ID for protected channels", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    const connectPromise = manager.connect("user_1");
    await Promise.resolve();

    await expect(manager.private("user.user_1")).rejects.toThrow(
      "Protected channels require an active socket connection",
    );
    emitConnected();
    await connectPromise;
  });

  it("uses the latest connected socket ID when refreshing protected subscription tokens", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    const connectPromise = manager.connect("user_1");
    await Promise.resolve();
    emitConnected("client-123");
    await connectPromise;
    await manager.private("user.user_1");

    const subscriptionOptions = mockClient.newSubscription.mock.calls[0][1];
    emitConnected("client-456");
    await subscriptionOptions.getToken();

    expect(authManager.getProtectedSubscribeToken).toHaveBeenLastCalledWith(
      "private-user.user_1",
      "user_1",
      "client-456",
    );
  });
});
