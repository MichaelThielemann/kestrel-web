import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const PORT = Number(process.env.KESTREL_E2E_PORT ?? 3091);
if (PORT === 3000 || PORT === 3005) throw new Error(`port ${PORT} is reserved; choose another KESTREL_E2E_PORT`);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const WORK_DIR = process.env.KESTREL_E2E_WORK_DIR ?? join(tmpdir(), `kestrel-e2e-${PORT}`);
export const SERVER_LOG = join(REPO_ROOT, "e2e", "server.log");
export const DATA_DIR = join(WORK_DIR, "data");
export const SITE_DIR = join(DATA_DIR, "blobs", "site");
export const SEED_FILE = join(WORK_DIR, "seed.json");
export const ADMIN_STATE = join(WORK_DIR, "admin-state.json");
export const EDITOR_STATE = join(WORK_DIR, "editor-state.json");

export const ADMIN = { username: "admin", password: "change-me" };
export const EDITOR = { username: "editor", password: "editor-passphrase" };
