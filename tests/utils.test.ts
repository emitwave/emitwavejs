import { describe, it, expect, vi } from "vitest";
import {
  snakeToCamel,
  camelToSnake,
  toCamelCase,
  toSnakeCase,
  createLogger,
  hasProtectedPrefix,
  parseChannelType,
  toEncryptedPrivateChannelName,
  toLogicalChannelName,
  toPresenceChannelName,
  toPrivateChannelName,
  validateChannelName,
} from "../src/utils.js";

describe("snakeToCamel", () => {
  it("converts snake_case to camelCase", () => {
    expect(snakeToCamel("subscriber_id")).toBe("subscriberId");
    expect(snakeToCamel("request_id")).toBe("requestId");
    expect(snakeToCamel("already")).toBe("already");
  });
});

describe("camelToSnake", () => {
  it("converts camelCase to snake_case", () => {
    expect(camelToSnake("subscriberId")).toBe("subscriber_id");
    expect(camelToSnake("requestId")).toBe("request_id");
    expect(camelToSnake("already")).toBe("already");
  });
});

describe("toCamelCase", () => {
  it("converts object keys recursively", () => {
    const input = {
      subscriber_id: "123",
      nested_obj: { client_id: "abc" },
    };
    expect(toCamelCase(input)).toEqual({
      subscriberId: "123",
      nestedObj: { clientId: "abc" },
    });
  });

  it("handles arrays", () => {
    const input = [{ client_id: "a" }, { client_id: "b" }];
    expect(toCamelCase(input)).toEqual([
      { clientId: "a" },
      { clientId: "b" },
    ]);
  });

  it("passes through primitives", () => {
    expect(toCamelCase("hello")).toBe("hello");
    expect(toCamelCase(42)).toBe(42);
    expect(toCamelCase(null)).toBe(null);
  });
});

describe("toSnakeCase", () => {
  it("converts object keys recursively", () => {
    const input = { subscriberId: "123" };
    expect(toSnakeCase(input)).toEqual({ subscriber_id: "123" });
  });
});

describe("createLogger", () => {
  it("logs when debug is true", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger(true);
    logger.log("test");
    expect(spy).toHaveBeenCalledWith("[EmitWave]", "test");
    spy.mockRestore();
  });

  it("does not log when debug is false", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger(false);
    logger.log("test");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("validateChannelName", () => {
  it("allows dotted private channel names", () => {
    expect(() => validateChannelName("user.user_123")).not.toThrow();
    expect(() => validateChannelName("company.acme")).not.toThrow();
  });
});

describe("channel name mapping", () => {
  it("maps private logical names to backend channel names", () => {
    expect(toPrivateChannelName("user.user_123")).toBe("private-user.user_123");
    expect(toPrivateChannelName("company.acme")).toBe("private-company.acme");
  });

  it("rejects private prefixed input", () => {
    expect(() => toPrivateChannelName("private-user.user_123")).toThrow(
      'Use private("user.user_123")',
    );
  });

  it("maps presence logical names to backend channel names", () => {
    expect(toPresenceChannelName("user.user_123")).toBe("presence-user.user_123");
    expect(toPresenceChannelName("company.acme")).toBe("presence-company.acme");
  });

  it("rejects presence prefixed input", () => {
    expect(() => toPresenceChannelName("presence-user.user_123")).toThrow(
      'Use presence("user.user_123")',
    );
  });

  it("maps encrypted private logical names to backend channel names", () => {
    expect(toEncryptedPrivateChannelName("user.user_123")).toBe("private-encrypted-user.user_123");
    expect(toEncryptedPrivateChannelName("company.acme")).toBe("private-encrypted-company.acme");
  });

  it("rejects encrypted private prefixed input", () => {
    expect(() => toEncryptedPrivateChannelName("private-encrypted-user.user_123")).toThrow(
      'Use encryptedPrivate("user.user_123")',
    );
  });

  it("converts backend channel names to logical names", () => {
    expect(toLogicalChannelName("private-user.user_123")).toBe("user.user_123");
    expect(toLogicalChannelName("private-company.acme")).toBe("company.acme");
    expect(toLogicalChannelName("private-encrypted-user.user_123")).toBe("user.user_123");
    expect(toLogicalChannelName("private-encrypted-company.acme")).toBe("company.acme");
    expect(toLogicalChannelName("presence-user.user_123")).toBe("user.user_123");
    expect(toLogicalChannelName("presence-company.acme")).toBe("company.acme");
  });

  it("detects protected prefixes", () => {
    expect(hasProtectedPrefix("private-user.user_123")).toBe(true);
    expect(hasProtectedPrefix("private-encrypted-user.user_123")).toBe(true);
    expect(hasProtectedPrefix("presence-company.acme")).toBe(true);
    expect(hasProtectedPrefix("announcements")).toBe(false);
  });

  it("parses encrypted private channel types", () => {
    expect(parseChannelType("private-encrypted-user.user_123")).toBe("encrypted_private");
    expect(parseChannelType("presence-company.acme")).toBe("presence");
    expect(parseChannelType("private-user.user_123")).toBe("private");
    expect(parseChannelType("announcements")).toBe("public");
  });
});
