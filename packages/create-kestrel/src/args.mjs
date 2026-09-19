import { resolve } from "node:path";
import { normalizeFeatures } from "./features.mjs";

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"];
export const BLOBSTORES = ["filesystem", "s3"];

const BOOLEAN_FLAGS = new Set(["yes", "force", "help", "version"]);
const VALUE_FLAGS = new Set(["name", "pm", "locales", "features", "blobstore", "admin-user", "admin-password"]);
const SHORT_FLAGS = { y: "yes", f: "force", h: "help", v: "version" };

const LOCALE_PATTERN = /^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/;
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const errors = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (arg.length === 0 || !arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    const long = arg.startsWith("--");
    const body = long ? arg.slice(2) : arg.slice(1);
    const separator = body.indexOf("=");
    const rawName = separator === -1 ? body : body.slice(0, separator);
    const name = long ? rawName : (SHORT_FLAGS[rawName] ?? rawName);
    const inlineValue = separator === -1 ? null : body.slice(separator + 1);

    if (BOOLEAN_FLAGS.has(name)) {
      if (inlineValue !== null) errors.push(`--${name} takes no value`);
      flags[name] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      errors.push(`unknown option "${arg}"`);
      continue;
    }
    if (inlineValue !== null) {
      flags[name] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("-")) {
      errors.push(`--${name} needs a value`);
      continue;
    }
    flags[name] = next;
    index++;
  }

  return { flags, positional, errors };
}

export function toPackageName(input) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-_.]+/, "")
    .replace(/[-_.]+$/, "")
    .replace(/-{2,}/g, "-");
  return slug.length === 0 ? "kestrel-site" : slug;
}

export function detectPackageManager(userAgent) {
  if (typeof userAgent !== "string" || userAgent.length === 0) return "pnpm";
  const name = userAgent.split(" ")[0]?.split("/")[0];
  return PACKAGE_MANAGERS.includes(name) ? name : "pnpm";
}

function splitList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function localeProblem(locale) {
  return LOCALE_PATTERN.test(locale) ? null : `"${locale}" is not a locale code such as "de" or "pt-BR"`;
}

export function usernameProblem(username) {
  if (username.length === 0) return "the admin username must not be empty";
  return USERNAME_PATTERN.test(username) ? null : `"${username}" is not a usable username (letters, digits, ".", "_" and "-")`;
}

export function resolveOptions(argv, env) {
  const { flags, positional, errors } = parseArgs(argv);
  const options = {
    help: flags.help === true,
    version: flags.version === true,
    yes: flags.yes === true,
    force: flags.force === true,
    directory: null,
    name: null,
    packageManager: null,
    locales: null,
    features: null,
    blobstore: null,
    adminUser: null,
    adminPassword: null,
  };

  if (positional.length > 1) errors.push(`expected one target directory, got ${positional.length}`);
  const target = positional[0];
  if (target !== undefined) options.directory = resolve(target);

  if (typeof flags.name === "string") options.name = toPackageName(flags.name);

  if (typeof flags.pm === "string") {
    if (!PACKAGE_MANAGERS.includes(flags.pm)) errors.push(`--pm must be one of ${PACKAGE_MANAGERS.join(", ")}`);
    else options.packageManager = flags.pm;
  }

  if (typeof flags.locales === "string") {
    const locales = splitList(flags.locales);
    if (locales.length === 0) errors.push("--locales needs at least one locale");
    for (const locale of locales) {
      const problem = localeProblem(locale);
      if (problem !== null) errors.push(problem);
    }
    if (new Set(locales).size !== locales.length) errors.push("--locales lists the same locale twice");
    options.locales = locales;
  }

  if (typeof flags.features === "string") {
    const { features, unknown } = normalizeFeatures(splitList(flags.features));
    for (const feature of unknown) errors.push(`unknown feature "${feature}"`);
    options.features = features;
  }

  if (typeof flags.blobstore === "string") {
    if (!BLOBSTORES.includes(flags.blobstore)) errors.push(`--blobstore must be one of ${BLOBSTORES.join(", ")}`);
    else options.blobstore = flags.blobstore;
  }

  if (typeof flags["admin-user"] === "string") {
    const problem = usernameProblem(flags["admin-user"]);
    if (problem !== null) errors.push(problem);
    else options.adminUser = flags["admin-user"];
  }

  const password = typeof flags["admin-password"] === "string" ? flags["admin-password"] : env.KESTREL_ADMIN_PASSWORD;
  if (typeof password === "string" && password.length > 0) options.adminPassword = password;

  return { options, errors };
}
