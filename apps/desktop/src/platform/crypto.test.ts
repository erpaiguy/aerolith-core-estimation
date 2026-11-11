import { describe, expect, it } from "vitest";
import { hashPin, pinHashesEqual, verifyPin } from "./crypto";

describe("pin hash compare", () => {
  it("accepts the matching pin and rejects a different hash of the same length", async () => {
    const salt = "abc123";
    const hash = await hashPin("1234", salt);
    expect(pinHashesEqual(hash, hash)).toBe(true);
    expect(await verifyPin("1234", salt, hash)).toBe(true);
    const flipped = hash.slice(0, -1) + (hash.endsWith("a") ? "b" : "a");
    expect(flipped).toHaveLength(hash.length);
    expect(pinHashesEqual(hash, flipped)).toBe(false);
    expect(await verifyPin("9999", salt, hash)).toBe(false);
    expect(pinHashesEqual(hash, hash.slice(0, -1))).toBe(false);
  });
});
