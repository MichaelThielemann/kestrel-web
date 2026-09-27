import { writeFileSync } from "node:fs";
import { Api } from "./api.ts";
import { ADMIN, ADMIN_STATE, BASE_URL, EDITOR, EDITOR_STATE, SEED_FILE } from "./env.ts";
import { seedPlayground } from "./seed.ts";

function writeState(file: string, token: string | null): void {
  const cookie = { name: "kestrel_token", value: token ?? "", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Strict" };
  writeFileSync(file, JSON.stringify({ cookies: [cookie], origins: [] }));
}

export default async function globalSetup(): Promise<void> {
  const admin = await new Api(BASE_URL).login(ADMIN.username, ADMIN.password);
  const seed = await seedPlayground(admin);
  writeFileSync(SEED_FILE, JSON.stringify(seed));
  writeState(ADMIN_STATE, admin.token);
  const editor = await new Api(BASE_URL).login(EDITOR.username, EDITOR.password);
  writeState(EDITOR_STATE, editor.token);
}
