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
  if (name.includes(".")) {
    throw new Error('Channel name cannot contain "."');
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload));
}

export function parseChannelType(name: string): ChannelType {
  if (name.startsWith("presence-")) return "presence";
  if (name.startsWith("private-")) return "private";
  return "public";
}
