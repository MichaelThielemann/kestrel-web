import { describe, expect, it } from "vitest";
import { verifyPassword } from "@michaelthielemann/kestrel-authn-multi/impl";
import { MIN_PASSWORD_LENGTH, generatePassword, hashPassword, passwordProblem } from "./src/password.mjs";

describe("hashPassword", () => {
  it("produces the format authn-multi verifies", () => {
    const hash = hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(verifyPassword("correct horse battery", hash)).toBe(true);
    expect(verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("salts every hash separately", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("round-trips a password with non-ascii characters", () => {
    const password = "Straße-мир-🕊";
    expect(verifyPassword(password, hashPassword(password))).toBe(true);
  });
});

describe("generatePassword", () => {
  it("is long enough and url safe", () => {
    const password = generatePassword();
    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(passwordProblem(password)).toBeNull();
  });
});

describe("passwordProblem", () => {
  it("asks for at least twelve characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(passwordProblem("elevenchars")).toBe("the password must have at least 12 characters");
    expect(passwordProblem("long-enough-phrase")).toBeNull();
  });

  it("refuses a well-known password regardless of case", () => {
    expect(passwordProblem("password1234")).toBe("the password is too common, choose another one");
    expect(passwordProblem("Password1234")).toBe("the password is too common, choose another one");
    expect(passwordProblem("123456789012")).toBe("the password is too common, choose another one");
  });

  it("refuses a single character repeated", () => {
    expect(passwordProblem("aaaaaaaaaaaaaaa")).toBe("the password is too common, choose another one");
  });
});
