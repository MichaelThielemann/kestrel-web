import { basename, resolve } from "node:path";
import { BLOBSTORES, PACKAGE_MANAGERS, localeProblem, toPackageName, usernameProblem } from "./args.mjs";
import { ALL_FEATURES, DEFAULT_FEATURES, FEATURE_SUMMARY, normalizeFeatures } from "./features.mjs";
import { MIN_PASSWORD_LENGTH, generatePassword, passwordProblem } from "./password.mjs";

export const DEFAULT_DIRECTORY = "my-site";
export const DEFAULT_ADMIN_USER = "admin";
export const DEFAULT_LOCALE = "en";
export const DEFAULT_BLOBSTORE = "filesystem";

const MAX_ATTEMPTS = 5;

export class PromptError extends Error {}

function splitList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function askValid(io, question, fallback, validate) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const answer = await io.ask(question, fallback);
    const value = answer.trim().length === 0 ? fallback : answer.trim();
    const problem = validate(value);
    if (problem === null) return value;
    io.write(problem);
  }
  throw new PromptError(`no usable answer for "${question}" after ${MAX_ATTEMPTS} attempts`);
}

async function askChoice(io, question, choices, fallback) {
  return askValid(io, `${question} (${choices.join(" / ")})`, fallback, (value) =>
    choices.includes(value) ? null : `pick one of ${choices.join(", ")}`);
}

async function askFeatures(io) {
  io.write("Features (comma separated, blank keeps the preselection):");
  for (const feature of ALL_FEATURES) {
    const mark = DEFAULT_FEATURES.includes(feature) ? "x" : " ";
    io.write(`  [${mark}] ${feature} — ${FEATURE_SUMMARY[feature]}`);
  }
  const answer = await askValid(io, "Features", DEFAULT_FEATURES.join(","), (value) => {
    const { unknown } = normalizeFeatures(splitList(value));
    return unknown.length === 0 ? null : `unknown feature${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`;
  });
  return normalizeFeatures(splitList(answer)).features;
}

async function askPassword(io) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const first = await io.secret(`Admin password (at least ${MIN_PASSWORD_LENGTH} characters)`);
    const problem = passwordProblem(first);
    if (problem !== null) {
      io.write(problem);
      continue;
    }
    const second = await io.secret("Repeat the password");
    if (first === second) return first;
    io.write("the two passwords differ");
  }
  throw new PromptError(`no usable password after ${MAX_ATTEMPTS} attempts`);
}

export async function collectAnswers(io, options, detectedPackageManager) {
  const interactive = !options.yes;

  const directoryInput = options.directory !== null
    ? options.directory
    : resolve(interactive
      ? await askValid(io, "Project directory", DEFAULT_DIRECTORY, (value) => (value.length === 0 ? "the directory must not be empty" : null))
      : DEFAULT_DIRECTORY);

  const nameFallback = options.name ?? toPackageName(basename(directoryInput));
  const name = options.name !== null || !interactive
    ? nameFallback
    : toPackageName(await askValid(io, "Package name", nameFallback, () => null));

  const packageManager = options.packageManager ?? (interactive
    ? await askChoice(io, "Package manager", PACKAGE_MANAGERS, detectedPackageManager)
    : detectedPackageManager);

  const flagLocales = options.locales;
  const defaultLocale = flagLocales !== null
    ? flagLocales[0]
    : interactive
      ? await askValid(io, "Default locale", DEFAULT_LOCALE, localeProblem)
      : DEFAULT_LOCALE;

  const furtherLocales = flagLocales !== null
    ? flagLocales.slice(1)
    : interactive
      ? splitList(await askValid(io, "Further locales (comma separated, blank for none)", "", (value) => {
        for (const locale of splitList(value)) {
          const problem = localeProblem(locale);
          if (problem !== null) return problem;
        }
        return null;
      }))
      : [];

  const locales = [defaultLocale, ...furtherLocales.filter((locale) => locale !== defaultLocale)];

  const features = options.features ?? (interactive ? await askFeatures(io) : [...DEFAULT_FEATURES]);

  const blobstore = options.blobstore ?? (interactive
    ? await askChoice(io, "Blobstore", BLOBSTORES, DEFAULT_BLOBSTORE)
    : DEFAULT_BLOBSTORE);

  const adminUser = options.adminUser ?? (interactive
    ? await askValid(io, "Admin username", DEFAULT_ADMIN_USER, usernameProblem)
    : DEFAULT_ADMIN_USER);

  let password = options.adminPassword;
  let generated = false;
  if (password === null) {
    if (interactive) password = await askPassword(io);
    else {
      password = generatePassword();
      generated = true;
    }
  } else {
    const problem = passwordProblem(password);
    if (problem !== null) throw new PromptError(problem);
  }

  return { directory: directoryInput, name, packageManager, defaultLocale, locales, features, blobstore, adminUser, password, generated };
}
