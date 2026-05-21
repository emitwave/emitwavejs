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

  it("presence creates PresenceChannel", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await manager.connect("user_1");
    const ch = await manager.presence("chat-room");
    expect(ch).toBeDefined();
    expect(ch.name).toBe("chat-room");
  });

  it("throws if channel called before connect", async () => {
    const manager = new RealtimeManager({
      realtimeUrl: "wss://rt.example.com/ws",
      authManager,
      logger,
    });

    await expect(manager.channel("test")).rejects.toThrow("Not connected");
  });
});
