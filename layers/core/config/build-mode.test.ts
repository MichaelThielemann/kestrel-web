import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ConfigModule = typeof import("./index");

const SOURCE_DIR = import.meta.dirname;
const MANAGED = ["NODE_ENV", "KESTREL_ADMIN_PASSWORD_HASH", "KESTREL_MFA_KEY", "KESTREL_DEVICE_KEY", "KESTREL_BLOBSTORE", "KESTREL_BLOBS_DIR"];

let dir: string;
let built: ConfigModule;

function asServerBundle(source: string): string {
  return source.replace(/\bprocess\.env\.NODE_ENV\b(?!\.)/g, JSON.stringify("production"));
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kestrel-config-build-"));
  writeFileSync(join(dir, "index.ts"), asServerBundle(readFileSync(join(SOURCE_DIR, "index.ts"), "utf8")));
  copyFileSync(join(SOURCE_DIR, "development.ts"), join(dir, "development.ts"));
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false });
  built = await jiti.import<ConfigModule>(join(dir, "index.ts"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const name of MANAGED) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the config helpers in a built server, where the build fixes NODE_ENV to production", () => {
  it("require KESTREL_MFA_KEY whatever NODE_ENV the process has", () => {
    expect(() => built.mfaKey()).toThrow("kestrel.config: KESTREL_MFA_KEY must be set in this environment");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => built.mfaKey()).toThrow("kestrel.config: KESTREL_MFA_KEY must be set in this environment");
  });

  it("require KESTREL_ADMIN_PASSWORD_HASH whatever NODE_ENV the process has", () => {
    expect(() => built.adminPasswordHash()).toThrow("kestrel.config: KESTREL_ADMIN_PASSWORD_HASH must be set in this environment");
  });

  it("refuse to pick a blob store without KESTREL_BLOBSTORE whatever NODE_ENV the process has", () => {
    expect(() => built.envBlobstore("/srv/data")).toThrow('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  });

  it("warn that known devices are forgotten at a restart without a device key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    built.deviceKeys();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("KESTREL_DEVICE_KEY is not set"));
  });

  it("take production from a given environment map's NODE_ENV", () => {
    expect(built.envBlobstore("/srv/data", {})).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/data/blobs" } });
    expect(() => built.envBlobstore("/srv/data", { NODE_ENV: "production" })).toThrow('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  });
});
