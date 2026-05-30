export interface EmitWaveConfig {
  appId: string;
  publicKey: string;
  subscriberExternalId?: string;
  subscriberAccessToken?: string;
  subscriberRefreshToken?: string;
  apiUrl?: string;
  realtimeUrl?: string;
  authEndpoint?: string;
  debug?: boolean;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface PresenceInfo {
  clientId: string;
  userId: string;
  info?: unknown;
}

export interface RealtimePublicationEnvelope {
  event: string;
  data: unknown;
  encrypted?: boolean;
}

export interface EncryptedPublicationData {
  ciphertext: string;
  nonce: string;
}

export type RealtimeEventCallback = (
  data: unknown,
  envelope: RealtimePublicationEnvelope,
) => void;

export type ChannelEvents = {
  message: (data: unknown) => void;
  subscribe: () => void;
  unsubscribe: () => void;
  error: (err: Error) => void;
};

export type PresenceEvents = ChannelEvents & {
  join: (info: PresenceInfo) => void;
  leave: (info: PresenceInfo) => void;
};

export type EmitWaveEvents = {
  connected: () => void;
  disconnected: () => void;
  connecting: () => void;
  error: (err: Error) => void;
};

export interface ConnectOptions {
  subscriberExternalId?: string;
  subscriberAccessToken?: string;
  subscriberRefreshToken?: string;
}

export interface SubscriberTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer" | string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id?: string;
}

export type { ChannelType } from "./utils.js";
