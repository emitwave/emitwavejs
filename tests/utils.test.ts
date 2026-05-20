import { describe, it, expect, vi } from "vitest";
import {
  snakeToCamel,
  camelToSnake,
  toCamelCase,
  toSnakeCase,
  createLogger,
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
