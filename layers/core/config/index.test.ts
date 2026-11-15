import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminPasswordHash, deviceKeys, envBlobstore, envRobots, envStepLog, envStorageMigrations, kestrelDataDir, requiredEnv } from "./index";

const DEVELOPMENT_ADMIN_PASSWORD_HASH =
  "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

const MANAGED = [
  "NODE_ENV",
  "KESTREL_DATA_DIR",
  "KESTREL_APP_ROOT",
  "KESTREL_ADMIN_PASSWORD_HASH",
  "KESTREL_DEVICE_KEY",
  "KESTREL_BLOBSTORE",
  "KESTREL_S3_BUCKET",
  "KESTREL_S3_ENDPOINT",
  "KESTREL_S3_REGION",
  "KESTREL_S3_ACCESS_KEY_ID",
  "KESTREL_S3_SECRET_ACCESS_KEY",
  "KESTREL_ROBOTS_POLICY",
  "KESTREL_STEP_LOG",
  "KESTREL_STORAGE_MIGRATIONS",
  "KESTREL_MIGRATIONS",
  "KESTREL_BLOBS_DIR",
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

  it("reads a given environment map instead of process.env, and resolves against a given directory", () => {
    vi.stubEnv("KESTREL_DATA_DIR", "/from/process");
    expect(kestrelDataDir({ KESTREL_DATA_DIR: "/from/map" })).toBe("/from/map");
    expect(kestrelDataDir({ KESTREL_APP_ROOT: "/srv/other" })).toBe(resolve("/srv/other", "data"));
    expect(kestrelDataDir({}, "/srv/project")).toBe(resolve("/srv/project", "data"));
    expect(kestrelDataDir({ KESTREL_APP_ROOT: "app" }, "/srv/project")).toBe(resolve("/srv/project", "app", "data"));
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

describe("deviceKeys", () => {
  it("returns KESTREL_DEVICE_KEY when it is set, over the second-factor keys, and stays quiet", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KESTREL_DEVICE_KEY", "ab".repeat(32));
    expect(deviceKeys({ secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] })).toEqual({ secretKey: "ab".repeat(32) });
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the second-factor keys and their previous keys without KESTREL_DEVICE_KEY, and stays quiet", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    expect(deviceKeys({ secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] })).toEqual({ secretKey: "cd".repeat(32), previousSecretKeys: ["ef".repeat(32)] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to one random key per process without either, and warns once in production that a restart forgets known devices", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = deviceKeys().secretKey;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceKeys().secretKey).toBe(first);
    expect(warn).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production");
    expect(deviceKeys().secretKey).toBe(first);
    expect(deviceKeys().secretKey).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/KESTREL_DEVICE_KEY is not set.*restart/));
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

  it("passes allowInsecureEndpoint only when KESTREL_S3_ALLOW_INSECURE_ENDPOINT is true", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "s3");
    stubS3Env();
    expect(envBlobstore("/srv/app/data").config).not.toHaveProperty("allowInsecureEndpoint");
    vi.stubEnv("KESTREL_S3_ALLOW_INSECURE_ENDPOINT", "false");
    expect(envBlobstore("/srv/app/data").config).not.toHaveProperty("allowInsecureEndpoint");
    vi.stubEnv("KESTREL_S3_ALLOW_INSECURE_ENDPOINT", "true");
    expect(envBlobstore("/srv/app/data").config).toMatchObject({ allowInsecureEndpoint: true });
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

  it("roots the filesystem module at KESTREL_BLOBS_DIR when it is set", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "filesystem");
    vi.stubEnv("KESTREL_BLOBS_DIR", "/srv/work/local-blobs");
    expect(envBlobstore("/srv/app/data")).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: "/srv/work/local-blobs" } });
    expect(envBlobstore("/srv/app/data", { KESTREL_BLOBSTORE: "filesystem", KESTREL_BLOBS_DIR: "store" }).config).toEqual({ root: resolve("store") });
    expect(envBlobstore("/srv/app/data", { KESTREL_BLOBSTORE: "filesystem", KESTREL_BLOBS_DIR: "" }).config).toEqual({ root: resolve("/srv/app/data", "blobs") });
  });

  it("throws in production without a choice", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => envBlobstore("/srv/app/data")).toThrow('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
  });

  it("builds the s3 module from a given environment map without reading process.env", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "filesystem");
    vi.stubEnv("KESTREL_S3_BUCKET", "from-process");
    const env = { NODE_ENV: "production", KESTREL_BLOBSTORE: "s3", ...Object.fromEntries(S3_ENV), KESTREL_S3_ALLOW_INSECURE_ENDPOINT: "true" };

    expect(envBlobstore("/srv/app/data", env)).toEqual({
      use: "@michaelthielemann/kestrel-blobstore-s3",
      config: {
        bucket: "assets",
        endpoint: "https://s3.example.test",
        region: "eu-central-1",
        accessKeyId: "key-id",
        secretAccessKey: "secret",
        forcePathStyle: true,
        allowInsecureEndpoint: true,
      },
    });
  });

  it("applies the production rule and the required variables of a given environment map", () => {
    vi.stubEnv("KESTREL_BLOBSTORE", "s3");
    stubS3Env();

    expect(() => envBlobstore("/srv/app/data", { NODE_ENV: "production" })).toThrow('kestrel.config: KESTREL_BLOBSTORE must be "s3" or "filesystem" in production');
    expect(() => envBlobstore("/srv/app/data", { KESTREL_BLOBSTORE: "s3" })).toThrow("kestrel.config: KESTREL_S3_BUCKET must be set in this environment");
    expect(envBlobstore("/srv/app/data", {})).toEqual({ use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve("/srv/app/data", "blobs") } });
  });
});

describe("requiredEnv with an environment map", () => {
  it("reads the map, not process.env", () => {
    vi.stubEnv("KESTREL_S3_BUCKET", "from-process");
    expect(requiredEnv("KESTREL_S3_BUCKET", { KESTREL_S3_BUCKET: "from-map" })).toBe("from-map");
    expect(() => requiredEnv("KESTREL_S3_BUCKET", {})).toThrow("kestrel.config: KESTREL_S3_BUCKET must be set in this environment");
  });
});

describe("envRobots", () => {
  it("leaves the policy to delivery-static's NODE_ENV default when KESTREL_ROBOTS_POLICY is unset or empty", () => {
    expect(envRobots()).toEqual({});
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "");
    expect(envRobots()).toEqual({});
  });

  it("passes allow and disallow through", () => {
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "allow");
    expect(envRobots()).toEqual({ policy: "allow" });
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "disallow");
    expect(envRobots()).toEqual({ policy: "disallow" });
  });

  it("refuses any other value", () => {
    vi.stubEnv("KESTREL_ROBOTS_POLICY", "Allow");
    expect(() => envRobots()).toThrow('kestrel.config: KESTREL_ROBOTS_POLICY must be "allow" or "disallow", not "Allow"');
  });
});

describe("envStepLog", () => {
  it("returns all when KESTREL_STEP_LOG is unset or empty", () => {
    expect(envStepLog()).toBe("all");
    vi.stubEnv("KESTREL_STEP_LOG", "");
    expect(envStepLog()).toBe("all");
  });

  it("passes all, errors and off through", () => {
    for (const value of ["all", "errors", "off"] as const) {
      vi.stubEnv("KESTREL_STEP_LOG", value);
      expect(envStepLog()).toBe(value);
    }
  });

  it("refuses any other value", () => {
    vi.stubEnv("KESTREL_STEP_LOG", "Errors");
    expect(() => envStepLog()).toThrow('kestrel.config: KESTREL_STEP_LOG must be "all", "errors" or "off", not "Errors"');
  });
});

describe("envStorageMigrations", () => {
  it("returns check when KESTREL_STORAGE_MIGRATIONS is unset or empty, in production and outside it", () => {
    expect(envStorageMigrations()).toBe("check");
    vi.stubEnv("NODE_ENV", "production");
    expect(envStorageMigrations()).toBe("check");
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "");
    expect(envStorageMigrations()).toBe("check");
  });

  it("passes check and apply through", () => {
    for (const value of ["check", "apply"] as const) {
      vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", value);
      expect(envStorageMigrations()).toBe(value);
    }
  });

  it("ignores KESTREL_MIGRATIONS, which switches the content migrations", () => {
    vi.stubEnv("KESTREL_MIGRATIONS", "apply");
    expect(envStorageMigrations()).toBe("check");
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "apply");
    vi.stubEnv("KESTREL_MIGRATIONS", "check");
    expect(envStorageMigrations()).toBe("apply");
  });

  it("reads a given environment map instead of process.env", () => {
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "apply");
    expect(envStorageMigrations({})).toBe("check");
    expect(envStorageMigrations({ KESTREL_STORAGE_MIGRATIONS: "apply" })).toBe("apply");
  });

  it("refuses any other value", () => {
    vi.stubEnv("KESTREL_STORAGE_MIGRATIONS", "Apply");
    expect(() => envStorageMigrations()).toThrow('kestrel.config: KESTREL_STORAGE_MIGRATIONS must be "check" or "apply", not "Apply"');
  });
});
