import { describe, it, expect, vi } from "vitest";
import { TypedEmitter } from "../src/emitter.js";

interface TestEvents {
  hello: (name: string) => void;
  count: (n: number) => void;
}

describe("TypedEmitter", () => {
  it("calls listener on emit", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb = vi.fn();
    emitter.on("hello", cb);
    emitter.emit("hello", "world");
    expect(cb).toHaveBeenCalledWith("world");
  });

  it("returns unsubscribe function from on()", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb = vi.fn();
    const unsub = emitter.on("hello", cb);
    unsub();
    emitter.emit("hello", "world");
    expect(cb).not.toHaveBeenCalled();
  });

  it("off removes listener", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb = vi.fn();
    emitter.on("hello", cb);
    emitter.off("hello", cb);
    emitter.emit("hello", "world");
    expect(cb).not.toHaveBeenCalled();
  });

  it("once fires only once", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb = vi.fn();
    emitter.once("count", cb);
    emitter.emit("count", 1);
    emitter.emit("count", 2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
  });

  it("supports multiple listeners", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on("hello", cb1);
    emitter.on("hello", cb2);
    emitter.emit("hello", "test");
    expect(cb1).toHaveBeenCalledWith("test");
    expect(cb2).toHaveBeenCalledWith("test");
  });

  it("removeAllListeners clears specific event", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on("hello", cb1);
    emitter.on("count", cb2);
    emitter.removeAllListeners("hello");
    emitter.emit("hello", "test");
    emitter.emit("count", 1);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it("removeAllListeners with no args clears all", () => {
    const emitter = new TypedEmitter<TestEvents>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on("hello", cb1);
    emitter.on("count", cb2);
    emitter.removeAllListeners();
    emitter.emit("hello", "test");
    emitter.emit("count", 1);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});
