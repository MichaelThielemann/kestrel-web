import { randomBytes, scryptSync } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const GENERATED_PASSWORD_BYTES = 18;

export function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

export function generatePassword() {
  return randomBytes(GENERATED_PASSWORD_BYTES).toString("base64url");
}

export function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `the password must have at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}
