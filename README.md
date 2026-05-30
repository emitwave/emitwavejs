# @emitwave/emitwavejs

Official EmitWave JavaScript/TypeScript SDK for realtime features.

## Installation

```bash
npm install @emitwave/emitwavejs
```

## Quick Start

```ts
import { EmitWave } from "@emitwave/emitwavejs";

// Pattern 1: Authenticated subscriber private channels
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
  subscriberAccessToken: "subscriber_access_jwt",
  subscriberRefreshToken: "ewr_refresh_token",
});
await emitwave.connect();

// Pattern 2: Anonymous (public channels only)
const emitwave2 = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
});
await emitwave2.connect(); // no subscriberId needed

// Subscribe to a private channel (requires subscriber access token)
const channel = await emitwave.private("user.user_123");
channel.listen("notification.created", (data) => console.log(data));

// Subscribe to an encrypted private channel
const secure = await emitwave.encryptedPrivate("user.user_123");
secure.listen("notification.created", (data) => console.log(data));

// Subscribe to a public channel (no auth token needed)
const news = await emitwave.channel("news");
news.listen("product.updated", (data) => console.log(data));

// Disconnect
emitwave.disconnect();
```

## Channel Types

Channels are categorized by SDK method:

| Method | Type | Auth | Description |
|--------|------|------|-------------|
| _(none)_ | Public | No token | Open channels anyone can subscribe to |
| `emitwave.private(name)` | Private | Subscriber access token | Authenticated subscriber channels |
| `emitwave.presence(name)` | Presence | Subscriber access token | Authenticated channels with member join/leave state |
| `emitwave.encryptedPrivate(name)` | Encrypted private | Subscriber access token | Authenticated channels with encrypted payload data |

```ts
// Public channel — no subscribe token requested
const news = await emitwave.channel("news");

// Private channel — the SDK sends private-user.user_123 to the backend
const inbox = await emitwave.private("user.user_123");

// Company channel — the SDK sends private-company.acme to the backend
const billing = await emitwave.private("company.acme");

// Presence channel — the SDK sends presence-user.user_123 to the backend
const presence = await emitwave.presence("user.user_123");

// Encrypted private channel — the SDK sends private-encrypted-user.user_123 to the backend
const secureInbox = await emitwave.encryptedPrivate("user.user_123");
```

## Channel Names

Channel names must follow these rules:

- Cannot be empty
- Maximum 200 characters
- Cannot contain `:` (colon)
- Protected helper names are prefixless: `user.user_123` or `company.acme`
- Do not pass `private-`, `presence-`, or `private-encrypted-` prefixes to SDK helper methods

Invalid names throw an error immediately on the client, before any server request is made.

## Listening for Events

Backend publishes use an EmitWave event envelope:

```json
{
  "event": "invoice.created",
  "data": {
    "invoice_id": "inv_123"
  }
}
```

Subscribe once to a channel, then listen for multiple event names:

```ts
const billing = await emitwave.private("company.acme");

billing.listen("invoice.created", (data, envelope) => {
  console.log("created", data, envelope.event);
});

billing.listen("invoice.paid", (data) => {
  console.log("paid", data);
});

billing.on("message", (payload) => {
  console.log("raw publication", payload);
});
```

Presence channels support the same event listener API plus member events:

```ts
const presence = await emitwave.presence("company.acme");
presence.listen("member.updated", (data) => console.log(data));
presence.on("join", (member) => console.log("joined", member.userId));
presence.on("leave", (member) => console.log("left", member.userId));
const members = await presence.members();
```

Encrypted private channels decrypt the backend payload before calling your
listeners. The event name and channel name remain visible to routing systems;
only `data` is encrypted in transit through realtime infrastructure.

```ts
const secure = await emitwave.encryptedPrivate("user.user_123");
secure.listen("notification.created", (data) => {
  console.log("decrypted payload", data);
});
```

## Subscriber Tokens

Customer backends should issue subscriber tokens after authenticating the user in
your app:

```ts
// Server-side only, using a secret API key.
const serverEmitWave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_abc123_secret",
});

const tokens = await serverEmitWave.issueSubscriberToken("user_123");
```

Return `tokens.accessToken` and `tokens.refreshToken` to your frontend. The
browser SDK can then use them for private, presence, and encrypted private channels:

```ts
const emitwave = new EmitWave({
  appId: "app_123",
  publicKey: "ew_pk_xxx",
  subscriberAccessToken: tokens.accessToken,
  subscriberRefreshToken: tokens.refreshToken,
});

await emitwave.connect();
const inbox = await emitwave.private("user.user_123");
inbox.listen("notification.created", (data) => console.log(data));
```

Refresh tokens rotate. Store the latest refresh token returned by refresh:

```ts
const next = await emitwave.refreshSubscriberToken();
emitwave.setSubscriberTokens({
  accessToken: next.accessToken,
  refreshToken: next.refreshToken,
});

await emitwave.revokeSubscriberToken(); // logout
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
  subscriberAccessToken: "subscriber_access_jwt",
  subscriberRefreshToken: "ewr_refresh_token",
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

Your endpoint receives `POST` with `{ type: "connect" | "subscribe" | "protectedSubscribe", subscriberId?, channel? }` and must return:
- For `connect`: `{ token: "jwt..." }`
- For `subscribe`: `{ token: "jwt..." }`
- For `protectedSubscribe`: `{ auth: "jwt...", channel_data?: "...", shared_secret?: "..." }`

The SDK automatically extracts the internal channel name from the JWT payload.
`channel_data` is used for presence channels. `shared_secret` is required for encrypted private channels.

## TypeScript

All types are exported:

```ts
import type {
  EmitWaveConfig,
  PresenceInfo,
  ChannelEvents,
  EncryptedPrivateChannel,
  EncryptedPublicationData,
  ChannelType,
  EmitWaveEvents,
  RealtimeEventCallback,
  RealtimePublicationEnvelope,
} from "@emitwave/emitwavejs";
```

## Browser Security

Always use a **public key** (`ew_pk_`) in client-side code. Never expose secret keys (`ew_sk_`). The SDK warns if it detects a secret key.
