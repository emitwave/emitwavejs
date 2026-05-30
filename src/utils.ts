export function createLogger(debug: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (debug) console.log("[EmitWave]", ...args);
    },
    warn: (...args: unknown[]) => {
      if (debug) console.warn("[EmitWave]", ...args);
    },
    error: (...args: unknown[]) => {
      if (debug) console.error("[EmitWave]", ...args);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function convertKeys(
  obj: unknown,
  converter: (key: string) => string,
): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, converter));
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        converter(key),
        convertKeys(value, converter),
      ]),
    );
  }
  return obj;
}

export function toSnakeCase(obj: unknown): unknown {
  return convertKeys(obj, camelToSnake);
}

export function toCamelCase(obj: unknown): unknown {
  return convertKeys(obj, snakeToCamel);
}

export type ChannelType = "public" | "private" | "presence";

export function validateChannelName(name: string): void {
  if (!name) {
    throw new Error("Channel name cannot be empty");
  }
  if (name.length > 200) {
    throw new Error("Channel name cannot exceed 200 characters");
  }
  if (name.includes(":")) {
    throw new Error('Channel name cannot contain ":"');
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = payload.length % 4;
  if (pad) payload += "=".repeat(4 - pad);
  return JSON.parse(atob(payload));
}

export function parseChannelType(name: string): ChannelType {
  if (isPresenceChannelName(name)) return "presence";
  if (isPrivateChannelName(name)) return "private";
  return "public";
}

export function isPrivateChannelName(name: string): boolean {
  return name.startsWith("private-user.") || name.startsWith("private-company.");
}

export function isPresenceChannelName(name: string): boolean {
  return /^presence-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(name);
}

export function hasProtectedPrefix(name: string): boolean {
  return name.startsWith("private-") || name.startsWith("presence-");
}

export function toPrivateChannelName(name: string): string {
  validateChannelName(name);
  if (hasProtectedPrefix(name)) {
    throw new Error(
      `Do not include private- in channel names. Use private("${toLogicalChannelName(name)}") instead.`,
    );
  }

  const parts = name.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Unsupported private channel name. Use user.{user_id} or company.{company_id}.");
  }

  if (parts[0] === "user") return `private-user.${parts[1]}`;
  if (parts[0] === "company") return `private-company.${parts[1]}`;

  throw new Error("Unsupported private channel name. Use user.{user_id} or company.{company_id}.");
}

export function toPresenceChannelName(name: string): string {
  validateChannelName(name);
  if (name.startsWith("presence-")) {
    throw new Error(
      `Do not include presence- in channel names. Use presence("${toLogicalChannelName(name)}") instead.`,
    );
  }

  const parts = name.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    throw new Error("Unsupported presence channel name. Use {scope}.{id}.");
  }
  return `presence-${name}`;
}

export function toLogicalChannelName(name: string): string {
  if (name.startsWith("private-user.")) {
    return `user.${name.slice("private-user.".length)}`;
  }
  if (name.startsWith("private-company.")) {
    return `company.${name.slice("private-company.".length)}`;
  }
  if (name.startsWith("presence-")) {
    return name.slice("presence-".length);
  }
  return name;
}
