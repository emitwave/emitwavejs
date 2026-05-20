import { describe, it, expect, vi } from "vitest";
import { EmitWave } from "../src/client.js";

describe("EmitWave", () => {
  it("throws if appId is missing", () => {
    expect(
      () =>
        new EmitWave({
          appId: "",
          publicKey: "ew_pk_xxx",
        }),
    ).toThrow("appId is required");
  });

  it("throws if publicKey is missing", () => {
    expect(
      () =>
        new EmitWave({
          appId: "app_123",
          publicKey: "",
        }),
    ).toThrow("publicKey is required");
  });

  it("warns when secret key is used", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    new EmitWave({
      appId: "app_123",
      publicKey: "ew_sk_secret",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("secret key"),
    );
    spy.mockRestore();
  });

  it("creates instance with valid config", () => {
    const ew = new EmitWave({
      appId: "app_123",
      publicKey: "ew_pk_xxx",
    });
    expect(ew).toBeDefined();
    expect(ew.isConnected()).toBe(false);
  });

  it("accepts subscriberId in config", () => {
    const ew = new EmitWave({
      appId: "app_123",
      publicKey: "ew_pk_xxx",
      subscriberId: "user_123",
    });
    expect(ew).toBeDefined();
  });

  it("throws if subscriberId is not provided anywhere", async () => {
    const ew = new EmitWave({
      appId: "app_123",
      publicKey: "ew_pk_xxx",
    });
    await expect(ew.connect()).rejects.toThrow(
      "subscriberId is required",
    );
  });

  it("throws if connect() called with empty options and no config subscriberId", async () => {
    const ew = new EmitWave({
      appId: "app_123",
      publicKey: "ew_pk_xxx",
    });
    await expect(ew.connect({})).rejects.toThrow(
      "subscriberId is required",
    );
  });
});
