import type { Subscription } from "centrifuge";
import nacl from "tweetnacl";
import type {
  EncryptedPublicationData,
  RealtimePublicationEnvelope,
} from "../types.js";
import type { Logger } from "../utils.js";
import { Channel } from "./channel.js";

export class EncryptedPrivateChannel extends Channel {
  private readonly sharedSecret: Uint8Array;

  constructor(
    name: string,
    subscription: Subscription,
    logger: Logger,
    sharedSecret: string,
  ) {
    super(name, subscription, logger, false);
    this.sharedSecret = decodeBase64(sharedSecret, "shared_secret");

    if (this.sharedSecret.length !== nacl.secretbox.keyLength) {
      throw new Error("Encrypted private channel shared_secret must be 32 bytes");
    }

    this.bindEncryptedEvents();
  }

  private bindEncryptedEvents(): void {
    this.subscription.on("publication", (ctx) => {
      const decrypted = this.decryptPublication(ctx.data);
      if (decrypted) this.emitPublication(decrypted);
    });

    this.subscription.on("subscribed", () => {
      this.logger.log(`Subscribed to ${this.name}`);
      this.emitter.emit("subscribe");
    });

    this.subscription.on("unsubscribed", () => {
      this.logger.log(`Unsubscribed from ${this.name}`);
      this.emitter.emit("unsubscribe");
    });

    this.subscription.on("error", (ctx) => {
      this.emitter.emit("error", new Error(ctx.error.message));
    });
  }

  private decryptPublication(payload: unknown): RealtimePublicationEnvelope | null {
    if (!isEncryptedEnvelope(payload)) {
      this.emitter.emit("error", new Error("Encrypted private channel received an unencrypted or malformed payload"));
      return null;
    }

    try {
      const nonce = decodeBase64(payload.data.nonce, "nonce");
      if (nonce.length !== nacl.secretbox.nonceLength) {
        throw new Error("Encrypted private channel nonce must be 24 bytes");
      }

      const ciphertext = decodeBase64(payload.data.ciphertext, "ciphertext");
      const plaintext = nacl.secretbox.open(ciphertext, nonce, this.sharedSecret);
      if (!plaintext) {
        throw new Error("Unable to decrypt encrypted private channel payload");
      }

      const data = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
      return {
        event: payload.event,
        data,
        encrypted: true,
      };
    } catch (err) {
      this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }
}

function isEncryptedEnvelope(payload: unknown): payload is RealtimePublicationEnvelope & {
  data: EncryptedPublicationData;
  encrypted: true;
} {
  if (payload === null || typeof payload !== "object") return false;
  const envelope = payload as Partial<RealtimePublicationEnvelope>;
  const data = envelope.data as Partial<EncryptedPublicationData> | undefined;
  return (
    envelope.encrypted === true &&
    typeof envelope.event === "string" &&
    data !== undefined &&
    typeof data.ciphertext === "string" &&
    typeof data.nonce === "string"
  );
}

function decodeBase64(value: string, label: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new Error(`Invalid encrypted private channel ${label}`);
  }
}
