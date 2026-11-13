import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const PORT = Number(process.env.KESTREL_E2E_PORT ?? 3091);
if (PORT === 3000 || PORT === 3005) throw new Error(`port ${PORT} is reserved; choose another KESTREL_E2E_PORT`);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
/** The public site URL the playground server is started with: the origin of every sitemap entry and canonical link. */
export const SITE_URL = "https://www.example.test";
export const WORK_DIR = process.env.KESTREL_E2E_WORK_DIR ?? join(tmpdir(), `kestrel-e2e-${PORT}`);
export const SERVER_LOG = join(REPO_ROOT, "e2e", "server.log");
export const DATA_DIR = join(WORK_DIR, "data");
export const SITE_DIR = join(DATA_DIR, "blobs", "site");
export const SEED_FILE = join(WORK_DIR, "seed.json");
export const ADMIN_STATE = join(WORK_DIR, "admin-state.json");
export const EDITOR_STATE = join(WORK_DIR, "editor-state.json");

/** The Playwright image, pinned by digest, that screenshot baselines are recorded and compared in. */
export const VISUAL_IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";

export const ADMIN = { username: "admin", password: "change-me" };
export const EDITOR = { username: "editor", password: "editor-passphrase" };
