# @emitwave/emitwavejs

Official EmitWave JavaScript/TypeScript SDK for realtime features.

## Installation

```bash
npm install @emitwave/emitwavejs
```

## Quick Start

```ts
import { EmitWave } from "@emitwave/emitwavejs";

// Pattern 1: subscriberId at init
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
  subscriberId: "user_123",
});
await emitwave.connect();

// Pattern 2: subscriberId at connect time
const emitwave2 = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
});
await emitwave2.connect({ subscriberId: "user_123" });

// Subscribe to a private channel (requires auth token)
const channel = emitwave.channel("private-room-123");
channel.on("message", (data) => console.log(data));
channel.subscribe();

// Subscribe to a public channel (no auth token needed)
const news = emitwave.channel("news");
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
const news = emitwave.channel("news");

// Private channel — subscribe token auto-requested
const inbox = emitwave.channel("private-user-123");

// Presence channel — subscribe token + presence tracking
// Both forms return a PresenceChannel:
const room = emitwave.channel("presence-room");
const room2 = emitwave.presence("presence-room");
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
const presence = emitwave.presence("presence-chat-room");
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

Your endpoint receives `POST` with `{ type: "connect" | "subscribe", subscriberId, channel? }` and must return `{ token: "jwt..." }`.

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
