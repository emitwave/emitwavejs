# @emitwave/emitwavejs

Official EmitWave JavaScript/TypeScript SDK for realtime features.

## Installation

```bash
npm install @emitwave/emitwavejs
```

## Quick Start

```ts
import { EmitWave } from "@emitwave/emitwavejs";

// Pattern 1: Authenticated (private/presence channels)
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
});
await emitwave.connect({ subscriberId: "user_123" });

// Pattern 2: Anonymous (public channels only)
const emitwave2 = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
});
await emitwave2.connect(); // no subscriberId needed

// Subscribe to a private channel (requires auth token + subscriberId)
const channel = await emitwave.channel("private-room-123");
channel.on("message", (data) => console.log(data));
channel.subscribe();

// Subscribe to a public channel (no auth token needed)
const news = await emitwave.channel("news");
news.on("message", (data) => console.log(data));
news.subscribe();

// Disconnect
emitwave.disconnect();
```

## Channel Types

Channels are categorized by name prefix:

| Prefix | Type | Auth | Description |
|--------|------|------|-------------|
| _(none)_ | Public | No token | Open channels anyone can subscribe to |
| `private-` | Private | Subscribe token | Authenticated channels requiring a valid token |
| `presence-` | Presence | Subscribe token | Like private, plus member presence tracking |

```ts
// Public channel — no subscribe token requested
const news = await emitwave.channel("news");

// Private channel — subscribe token auto-requested (requires subscriberId)
const inbox = await emitwave.channel("private-user-123");

// Presence channel — subscribe token + presence tracking
// Both forms return a PresenceChannel:
const room = await emitwave.channel("presence-room");
const room2 = await emitwave.presence("presence-room");
```

## Channel Names

Channel names must follow these rules:

- Cannot be empty
- Maximum 200 characters
- Cannot contain `:` (colon)
- Cannot contain `.` (dot)

Invalid names throw an error immediately on the client, before any server request is made.

## Presence

```ts
const presence = await emitwave.presence("presence-chat-room");
presence.on("join", (info) => console.log("joined:", info));
presence.on("leave", (info) => console.log("left:", info));
presence.subscribe();

const members = await presence.members();
```

## Connection Events

```ts
emitwave.on("connected", () => console.log("connected"));
emitwave.on("disconnected", () => console.log("disconnected"));
emitwave.on("error", (err) => console.error(err));
```

## Configuration

```ts
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
  apiUrl: "https://api.emitwave.com",       // default
  realtimeUrl: "wss://rt.emitwave.com/connection/websocket", // default
  debug: false,                               // enable console logging
});
```

### Custom Auth Endpoint

If you proxy token requests through your backend:

```ts
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
  authEndpoint: "https://your-backend.com/emitwave/auth",
});
```

Your endpoint receives `POST` with `{ type: "connect" | "subscribe", subscriberId?, channel? }` and must return:
- For `connect`: `{ token: "jwt..." }`
- For `subscribe`: `{ token: "jwt..." }`

The SDK automatically extracts the internal channel name from the JWT payload.

## TypeScript

All types are exported:

```ts
import type {
  EmitWaveConfig,
  PresenceInfo,
  ChannelEvents,
  ChannelType,
  EmitWaveEvents,
} from "@emitwave/emitwavejs";
```

## Browser Security

Always use a **public key** (`ew_pk_`) in client-side code. Never expose secret keys (`ew_sk_`). The SDK warns if it detects a secret key.
