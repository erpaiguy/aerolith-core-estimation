import { describe, expect, it } from "vitest";
import { passwordProblem, readRecoveryProof } from "./passwordReset";

describe("password reset proof", () => {
  it("reads the verify link from the reset email", () => {
    const proof = readRecoveryProof(
      "https://mmuwdnzbapnbqnqfrwox.supabase.co/auth/v1/verify?token=abc123hash&type=recovery&redirect_to=https%3A%2F%2Fwww.theaerolithcore.com",
    );
    expect(proof).toEqual({ kind: "hash", tokenHash: "abc123hash" });
  });

  it("reads a session link and a numeric code", () => {
    expect(
      readRecoveryProof("https://www.theaerolithcore.com/account#access_token=tok-1&type=recovery"),
    ).toEqual({ kind: "session", accessToken: "tok-1" });
    expect(readRecoveryProof("123456")).toEqual({ kind: "otp", token: "123456" });
  });

  it("rejects a sentence and a short secret", () => {
    expect(readRecoveryProof("please reset my password")).toBeNull();
    expect(passwordProblem("short", "short")).toMatch(/8 characters/);
    expect(passwordProblem("long-enough", "different")).toMatch(/do not match/);
    expect(passwordProblem("long-enough", "long-enough")).toBeNull();
  });
});
