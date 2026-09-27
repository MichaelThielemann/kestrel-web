import { createHash } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./env.ts";

/** Moves the last password check of the session behind `token` back by `seconds`, as if it had been made that long ago. */
export function ageSessionAuth(token: string, seconds: number): void {
  const db = new DatabaseSync(join(DATA_DIR, "kestrel.db"));
  try {
    const id = createHash("sha256").update(token).digest("base64url");
    const changed = db.prepare('UPDATE "authn_sessions" SET "authTime" = "authTime" - ? WHERE "id" = ?').run(seconds * 1000, id).changes;
    if (changed !== 1) throw new Error(`expected one session row for the token, found ${String(changed)}`);
  } finally {
    db.close();
  }
}
