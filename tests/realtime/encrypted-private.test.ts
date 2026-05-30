import { describe, it, expect, vi } from "vitest";
import nacl from "tweetnacl";
import { EncryptedPrivateChannel } from "../../src/realtime/encrypted-private.js";
import { createLogger } from "../../src/utils.js";

function createMockSubscription() {
  const handlers = new Map<string, Function>();
  return {
    on: vi.fn((event: string, cb: Function) => {
      handlers.set(event, cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    history: vi.fn().mockResolvedValue({ publications: [] }),
    _trigger(event: string, ctx: unknown) {
      handlers.get(event)?.(ctx);
    },
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function encryptedEnvelope(event: string, data: unknown, key: Uint8Array) {
  const nonce = new Uint8Array(nacl.secretbox.nonceLength).fill(7);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = nacl.secretbox(plaintext, nonce, key);
  return {
    event,
    data: {
      ciphertext: encodeBase64(ciphertext),
      nonce: encodeBase64(nonce),
    },
    encrypted: true,
  };
}

describe("EncryptedPrivateChannel", () => {
  const logger = createLogger(false);

  it("decrypts encrypted envelopes for named listeners and messages", () => {
    const key = new Uint8Array(nacl.secretbox.keyLength).fill(3);
    const sub = createMockSubscription();
    const channel = new EncryptedPrivateChannel("user.user_1", sub as any, logger, encodeBase64(key));
    const listener = vi.fn();
    const message = vi.fn();

    channel.listen("notification.created", listener);
    channel.on("message", message);

    sub._trigger("publication", {
      data: encryptedEnvelope("notification.created", { id: "ntf_1" }, key),
    });

    expect(listener).toHaveBeenCalledWith(
      { id: "ntf_1" },
      { event: "notification.created", data: { id: "ntf_1" }, encrypted: true },
    );
    expect(message).toHaveBeenCalledWith({
      event: "notification.created",
      data: { id: "ntf_1" },
      encrypted: true,
    });
  });

  it("listen auto-subscribes", () => {
    const key = new Uint8Array(nacl.secretbox.keyLength).fill(3);
    const sub = createMockSubscription();
    const channel = new EncryptedPrivateChannel("user.user_1", sub as any, logger, encodeBase64(key));

    channel.listen("notification.created", vi.fn());

    expect(sub.subscribe).toHaveBeenCalledTimes(1);
  });

  it("emits error and skips listeners for malformed encrypted payloads", () => {
    const key = new Uint8Array(nacl.secretbox.keyLength).fill(3);
    const sub = createMockSubscription();
    const channel = new EncryptedPrivateChannel("user.user_1", sub as any, logger, encodeBase64(key));
    const error = vi.fn();
    const listener = vi.fn();

    channel.on("error", error);
    channel.listen("notification.created", listener);

    sub._trigger("publication", {
      data: {
        event: "notification.created",
        data: { ciphertext: "bad" },
        encrypted: true,
      },
    });

    expect(error).toHaveBeenCalledWith(expect.any(Error));
    expect(listener).not.toHaveBeenCalled();
  });

  it("throws when shared secret is not 32 bytes", () => {
    const sub = createMockSubscription();
    expect(
      () => new EncryptedPrivateChannel("user.user_1", sub as any, logger, encodeBase64(new Uint8Array(8))),
    ).toThrow("shared_secret must be 32 bytes");
  });
});
