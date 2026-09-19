import { INSIGHTS_FEATURE, MIGRATIONS_FEATURE, REDIRECTS_FEATURE } from "./features.mjs";

const TOKEN_PATTERN = /__[A-Z0-9_]+__/g;

export const INSTALL_COMMANDS = { pnpm: "pnpm install", npm: "npm install", yarn: "yarn", bun: "bun install" };
export const RUN_PREFIXES = { pnpm: "pnpm", npm: "npm run", yarn: "yarn", bun: "bun run" };

const S3_PLACEHOLDERS = {
  S3_BUCKET: "your-bucket",
  S3_ENDPOINT: "https://s3.example.com",
  S3_REGION: "eu-central-1",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
};

export function renderTemplate(source, values) {
  const kept = [];
  for (const line of source.split("\n")) {
    const tokens = line.match(TOKEN_PATTERN);
    if (tokens === null) {
      kept.push(line);
      continue;
    }
    let dropped = false;
    for (const token of tokens) {
      const name = token.slice(2, -2);
      if (!(name in values)) throw new Error(`create-kestrel: the template uses an unknown placeholder ${token}`);
      if (values[name] === null) dropped = true;
    }
    if (dropped) continue;
    kept.push(line.replace(TOKEN_PATTERN, (token) => values[token.slice(2, -2)]));
  }
  return kept.join("\n");
}

function jsonList(entries) {
  return `[${entries.map((entry) => JSON.stringify(entry)).join(", ")}]`;
}

export function orderedLocales(defaultLocale, locales) {
  return [defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)];
}

export function templateValues(answers, versions) {
  const insights = answers.features.includes(INSIGHTS_FEATURE);
  const s3 = answers.blobstore === "s3";
  const locales = orderedLocales(answers.defaultLocale, answers.locales);

  return {
    PROJECT_NAME: answers.name,
    PACKAGE_MANAGER: answers.packageManager,
    INSTALL_COMMAND: INSTALL_COMMANDS[answers.packageManager],
    DEV_COMMAND: `${RUN_PREFIXES[answers.packageManager]} dev`,
    BUILD_COMMAND: `${RUN_PREFIXES[answers.packageManager]} build`,
    KESTREL_WEB_VERSION: versions.kestrelWeb,
    KESTREL_VERSION: versions.kestrel,
    NUXT_VERSION: versions.nuxt,
    VUE_VERSION: versions.vue,
    VUE_ROUTER_VERSION: versions.vueRouter,
    TYPESCRIPT_VERSION: versions.typescript,
    VUE_TSC_VERSION: versions.vueTsc,
    INSIGHTS_VERSION: insights ? versions.insights : null,
    VUE_FLOW_VERSION: insights ? versions.vueFlow : null,
    DAGRE_VERSION: insights ? versions.dagre : null,
    LOCALES: jsonList(locales),
    DEFAULT_LOCALE: JSON.stringify(locales[0]),
    FEATURES: jsonList(answers.features),
    MIGRATIONS: answers.features.includes(MIGRATIONS_FEATURE) ? "{ migrations: [] }" : null,
    REDIRECTS_TYPE: answers.features.includes(REDIRECTS_FEATURE) ? '{ kind: "single", fields: { rules: { type: "json" } } }' : null,
    ADMIN_USER: JSON.stringify(answers.adminUser),
    BLOBSTORE: answers.blobstore,
    S3_BUCKET: s3 ? S3_PLACEHOLDERS.S3_BUCKET : null,
    S3_ENDPOINT: s3 ? S3_PLACEHOLDERS.S3_ENDPOINT : null,
    S3_REGION: s3 ? S3_PLACEHOLDERS.S3_REGION : null,
    S3_ACCESS_KEY_ID: s3 ? S3_PLACEHOLDERS.S3_ACCESS_KEY_ID : null,
    S3_SECRET_ACCESS_KEY: s3 ? S3_PLACEHOLDERS.S3_SECRET_ACCESS_KEY : null,
  };
}

export function envFile(answers, passwordHash) {
  const lines = [`KESTREL_ADMIN_PASSWORD_HASH=${passwordHash}`, `KESTREL_BLOBSTORE=${answers.blobstore}`];
  if (answers.blobstore === "s3") {
    lines.push(
      `KESTREL_S3_BUCKET=${S3_PLACEHOLDERS.S3_BUCKET}`,
      `KESTREL_S3_ENDPOINT=${S3_PLACEHOLDERS.S3_ENDPOINT}`,
      `KESTREL_S3_REGION=${S3_PLACEHOLDERS.S3_REGION}`,
      "KESTREL_S3_ACCESS_KEY_ID=",
      "KESTREL_S3_SECRET_ACCESS_KEY=",
    );
  }
  return `${lines.join("\n")}\n`;
}
