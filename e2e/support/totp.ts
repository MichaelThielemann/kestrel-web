import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/\s/g, "").toUpperCase()) {
    value = ((value << 5) | BASE32.indexOf(char)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The six-digit code an authenticator app shows for `secret`, `offset` time steps from now. */
export function totpNow(secret: string, offset = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const at = (mac[mac.length - 1] ?? 0) & 15;
  const binary = (((mac[at] ?? 0) & 127) << 24) | ((mac[at + 1] ?? 0) << 16) | ((mac[at + 2] ?? 0) << 8) | (mac[at + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, "0");
}
