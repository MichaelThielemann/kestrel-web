import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminPasswordHash, envBlobstore, kestrelDataDir, requiredEnv } from "./index";

const DEVELOPMENT_ADMIN_PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

const MANAGED = [
  "NODE_ENV",
  "KESTREL_DATA_DIR",
  "KESTREL_APP_ROOT",
  "KESTREL_ADMIN_PASSWORD_HASH",
  "KESTREL_BLOBSTORE",
  "KESTREL_S3_BUCKET",
  "KESTREL_S3_ENDPOINT",
  "KESTREL_S3_REGION",
  "KESTREL_S3_ACCESS_KEY_ID",
  "KESTREL_S3_SECRET_ACCESS_KEY",
];

const S3_ENV: [string, string][] = [
  ["KESTREL_S3_BUCKET", "assets"],
  ["KESTREL_S3_ENDPOINT", "https://s3.example.test"],
  ["KESTREL_S3_REGION", "eu-central-1"],
  ["KESTREL_S3_ACCESS_KEY_ID", "key-id"],
  ["KESTREL_S3_SECRET_ACCESS_KEY", "secret"],
];

function stubS3Env(): void {
  for (const [name, value] of S3_ENV) vi.stubEnv(name, value);
}

beforeEach(() => {
  for (const name of MANAGED) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("kestrelDataDir", () => {
  it("returns KESTREL_DATA_DIR when it is set", () => {
    vi.stubEnv("KESTREL_DATA_DIR", "/var/lib/kestrel");
    expect(kestrelDataDir()).toBe("/var/lib/kestrel");
  });

  it("falls back to data/ under KESTREL_APP_ROOT", () => {
    vi.stubEnv("KESTREL_APP_ROOT", "/srv/app");
    expect(kestrelDataDir()).toBe(resolve("/srv/app", "data"));
  });

  it("falls back to data/ under the process cwd without either variable", () => {
    expect(kestrelDataDir()).toBe(resolve(process.cwd(), "data"));
  });
});

describe("requiredEnv", () => {
  it("returns the value when it is set", () => {
    vi.stubEnv("KESTREL_S3_BUCKET", "assets");
    expect(requiredEnv("KESTREL_S3_BUCKET")).toBe("assets");
  });

  it("throws naming the variable when it is missing", () => {
    expect(() => requiredEnv("KESTREL_S3_BUCKET")).toThrow("kestrel.config: KESTREL_S3_BUCKET must be set in this environment");
  });

  it("treats an empty value as missing", () => {
    vi.stubEnv("KESTREL_S3_BUCKET", "");
    expect(() => requiredEnv("KESTREL_S3_BUCKET")).toThrow("kestrel.config: KESTREL_S3_BUCKET must be set in this environment");
  });
});

describe("adminPasswordHash", () => {
  it("requires KESTREL_ADMIN_PASSWORD_HASH in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => adminPasswordHash()).toThrow("kestrel.config: KESTREL_ADMIN_PASSWORD_HASH must be set in this environment");
  });

  it("returns the environment hash in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KESTREL_ADMIN_PASSWORD_HASH", "scrypt$deadbeef$cafe");
    expect(adminPasswordHash()).toBe("scrypt$deadbeef$cafe");
  });

  it("prefers the environment hash outside production and stays quiet", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("KESTREL_ADMIN_PASSWORD_HASH", "scrypt$deadbeef$cafe");

    expect(adminPasswordHash()).toBe("scrypt$deadbeef$cafe");
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the development hash outside production and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(adminPasswordHash()).toBe(DEVELOPMENT_ADMIN_PASSWORD_HASH);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("envBlobstore", () => {
  it("builds the s3 module from the environment", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "s3");
    stubS3Env();

    expect(envBlobstore("/srv/app/data")).toEqual({
      use: "@michaelthielemann/kestrel-blobstore-s3",
      config: {
        bucket: "assets",
        endpoint: "https://s3.example.test",
        region: "eu-central-1",
        accessKeyId: "key-id",
        secretAccessKey: "secret",
        forcePathStyle: true,
      },
    });
  });

  it("throws naming the missing s3 variable", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "s3");
    stubS3Env();
    vi.stubEnv("KESTREL_S3_REGION", undefined);

    expect(() => envBlobstore("/srv/app/data")).toThrow("kestrel.config: KESTREL_S3_REGION must be set in this environment");
  });

  it("builds the filesystem module under the data directory when nothing is chosen outside production", () => {
    expect(envBlobstore("/srv/app/data")).toEqual({
      use: "@michaelthielemann/kestrel-blobstore-filesystem",
      config: { root: resolve("/srv/app/data", "blobs") },
    });
  });

  it("builds the filesystem module in production when it is chosen explicitly", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KESTREL_BLOBSTORE", "filesystem");

    expect(envBlobstore("/srv/app/data")).toEqual({
      use: "@michaelthielemann/kestrel-blobstore-filesystem",
      config: { root: resolve("/srv/app/data", "blobs") },
    });
  });

  it("throws in production without a choice", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => envBlobstore("/srv/app/data")).toThrow('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  });
});
