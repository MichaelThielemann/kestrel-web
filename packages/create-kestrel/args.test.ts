import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPackageManager, parseArgs, resolveOptions, toPackageName } from "./src/args.mjs";

const NO_ENV = {};

describe("parseArgs", () => {
  it("reads a positional target and boolean flags", () => {
    const { flags, positional, errors } = parseArgs(["my-site", "--yes", "-f"]);
    expect(positional).toEqual(["my-site"]);
    expect(flags).toEqual({ yes: true, force: true });
    expect(errors).toEqual([]);
  });

  it("reads a value flag in both spellings", () => {
    expect(parseArgs(["--pm", "npm"]).flags).toEqual({ pm: "npm" });
    expect(parseArgs(["--pm=npm"]).flags).toEqual({ pm: "npm" });
  });

  it("keeps a value that starts with a dash out of the next flag", () => {
    expect(parseArgs(["--admin-password", "--yes"]).errors).toEqual(["--admin-password needs a value"]);
    expect(parseArgs(["--admin-password=-secret-"]).flags).toEqual({ "admin-password": "-secret-" });
  });

  it("stops flag parsing after --", () => {
    expect(parseArgs(["--", "--yes"]).positional).toEqual(["--yes"]);
  });

  it("names an unknown option", () => {
    expect(parseArgs(["--nope"]).errors).toEqual(['unknown option "--nope"']);
  });
});

describe("resolveOptions", () => {
  it("resolves the target directory against the working directory", () => {
    const { options } = resolveOptions(["my-site"], NO_ENV);
    expect(options.directory).toBe(resolve("my-site"));
    expect(options.name).toBeNull();
  });

  it("orders and filters the feature list", () => {
    const { options, errors } = resolveOptions(["--features", "revisions,images,references"], NO_ENV);
    expect(options.features).toEqual(["references", "images", "revisions"]);
    expect(errors).toEqual([]);
  });

  it("refuses an unknown feature, package manager, blobstore and locale", () => {
    const { errors } = resolveOptions(["--features", "telepathy", "--pm", "deno", "--blobstore", "ftp", "--locales", "de,Deutsch"], NO_ENV);
    expect(errors).toEqual([
      "--pm must be one of pnpm, npm, yarn, bun",
      '"Deutsch" is not a locale code such as "de" or "pt-BR"',
      'unknown feature "telepathy"',
      "--blobstore must be one of filesystem, s3",
    ]);
  });

  it("refuses the same locale twice", () => {
    expect(resolveOptions(["--locales", "de,de"], NO_ENV).errors).toEqual(["--locales lists the same locale twice"]);
  });

  it("takes the password from the environment when no flag gives one", () => {
    expect(resolveOptions([], { KESTREL_ADMIN_PASSWORD: "from-the-env" }).options.adminPassword).toBe("from-the-env");
    expect(resolveOptions(["--admin-password", "from-the-flag"], { KESTREL_ADMIN_PASSWORD: "from-the-env" }).options.adminPassword).toBe("from-the-flag");
  });

  it("refuses a username that is not usable", () => {
    expect(resolveOptions(["--admin-user", "a b"], NO_ENV).errors).toEqual(['"a b" is not a usable username (letters, digits, ".", "_" and "-")']);
  });
});

describe("toPackageName", () => {
  it("slugifies a directory name", () => {
    expect(toPackageName("My Site")).toBe("my-site");
    expect(toPackageName("  ...Ötzi!  ")).toBe("tzi");
    expect(toPackageName("---")).toBe("kestrel-site");
  });
});

describe("detectPackageManager", () => {
  it("reads the manager out of the npm user agent", () => {
    expect(detectPackageManager("yarn/4.1.0 npm/? node/v22.13.0 linux x64")).toBe("yarn");
    expect(detectPackageManager("bun/1.1.0")).toBe("bun");
    expect(detectPackageManager("deno/2.0.0")).toBe("pnpm");
    expect(detectPackageManager(undefined)).toBe("pnpm");
  });
});
