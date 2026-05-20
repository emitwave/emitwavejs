import { describe, it, expect } from "vitest";
import { EmitWaveError, createErrorFromResponse } from "../src/errors.js";

describe("EmitWaveError", () => {
  it("has correct properties", () => {
    const err = new EmitWaveError("Not found", "NOT_FOUND", 404, null, "req_1");
    expect(err.message).toBe("Not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.requestId).toBe("req_1");
    expect(err.name).toBe("EmitWaveError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("createErrorFromResponse", () => {
  it("creates error from API error body", () => {
    const err = createErrorFromResponse(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
        details: { field: "token" },
      },
      request_id: "req_abc",
    });

    expect(err).toBeInstanceOf(EmitWaveError);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.status).toBe(401);
    expect(err.message).toBe("Authentication is required.");
    expect(err.details).toEqual({ field: "token" });
    expect(err.requestId).toBe("req_abc");
  });
});
