import { randomBytes, scryptSync } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;

const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "123456789012345",
  "1234567890abc",
  "1q2w3e4r5t6y",
  "abcdefghijkl",
  "abcd1234abcd",
  "admin1234567",
  "adminadmin12",
  "administrator",
  "changemechangeme",
  "iloveyou1234",
  "letmein12345",
  "password1234",
  "password12345",
  "passwordpassword",
  "p@ssw0rd1234",
  "qwerty123456",
  "qwertyqwerty",
  "qwertyuiop12",
  "qwertyuiopas",
  "welcome12345",
  "kestrelkestrel",
]);

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
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1*$/u.test(password)) return "the password is too common, choose another one";
  return null;
}
