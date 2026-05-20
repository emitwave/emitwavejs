export interface EmitWaveConfig {
  appId: string;
  publicKey: string;
  subscriberId?: string;
  apiUrl?: string;
  realtimeUrl?: string;
  authEndpoint?: string;
  debug?: boolean;
}

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface PresenceInfo {
  clientId: string;
  userId: string;
}

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
  subscriberId?: string;
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
