import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { Finding, SourceRule, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { autoFinding, docsAnchor, packageJsonPath } from "./ruleHelpers";

const RULE = "scripts/host-binary";
const DOCS = docsAnchor("scripts-that-call-kestrel-web-upgrade");
const BINARY = "kestrel-web-upgrade";
const REPLACEMENT = "kestrel upgrade";

const ENV_PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:cross-env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)?`;
const RUNNER_COMMAND = String.raw`(?:npx|pnpx|bunx|npm\s+(?:exec|x)|pnpm\s+dlx|yarn\s+dlx)`;
const RUNNER_FLAG = String.raw`(?:--(?!no(?:-install)?\b|package\b)[a-z][\w-]*(?:=\S+)?|-(?!p\b)[a-zA-Z]+)\s+`;
const FETCHING_RUNNER = String.raw`${RUNNER_COMMAND}\s+(?:${RUNNER_FLAG})*(?:--\s+)?`;
const FETCHING_RUNNER_ONLY = new RegExp(String.raw`^${FETCHING_RUNNER}$`);
const RUNNER = String.raw`(?:pnpm\s+(?:exec\s+)?|yarn\s+(?:run\s+)?|${FETCHING_RUNNER})?`;
const END = String.raw`(?![\w@/-]|\.\w)`;
const SCRIPT_TOKEN = new RegExp(String.raw`(^|[;&|]|\n)(\s*${ENV_PREFIX})(${RUNNER})${BINARY}${END}|(node_modules\/\.bin\/)${BINARY}${END}`, "g");
const UNSCOPED_FETCH = new RegExp(String.raw`(?:^|[^\w@./-])${ENV_PREFIX}${FETCHING_RUNNER}${BINARY}${END}`);
const UNSCOPED_PACKAGE = new RegExp(String.raw`(?:^|[^\w@./-])${RUNNER_COMMAND}\s+(?:\S+\s+)*?(?:-p\s+|--package[=\s]\s*)${BINARY}(?:@\S*)?${END}`);
const SAFE_COMMANDS = "run the installed command instead (pnpm exec kestrel upgrade …, npm exec --no -- kestrel upgrade …, yarn kestrel upgrade …) or the scoped package (npx -y @michaelthielemann/kestrel-cli@6 upgrade …); the unscoped name is not this project's package";
const FILE_TOKEN = new RegExp(String.raw`(^|[\s"'\`;&|(=]|node_modules\/\.bin\/)${BINARY}${END}`);
const BIN_FILE = /kestrel-web\/bin\/kestrel-web-upgrade\.mjs\b/;

/** The command with every `kestrel-web-upgrade` replaced by `kestrel upgrade`, also behind a runner or environment prefix; a runner that could fetch the unscoped name from the registry (`npx`, `npm exec`, `pnpm dlx`, `yarn dlx`, `bunx`) is dropped, so the script runs the installed command. Unchanged when nothing matched. */
export function rewriteHostBinary(command: string): string {
  return command.replace(SCRIPT_TOKEN, (_match, sep: string | undefined, prefix: string | undefined, runner: string | undefined, binDir: string | undefined) => {
    if (binDir !== undefined) return `${binDir}${REPLACEMENT}`;
    const keep = runner !== undefined && FETCHING_RUNNER_ONLY.test(runner) ? "" : (runner ?? "");
    return `${sep ?? ""}${prefix ?? ""}${keep}${REPLACEMENT}`;
  });
}

/** Whether `command` runs `kestrel-web-upgrade` through a runner that fetches the unscoped name from the registry when it is not installed, which would run whatever package has that name. */
export function runsUnscopedHostBinary(command: string): boolean {
  return UNSCOPED_FETCH.test(command) || UNSCOPED_PACKAGE.test(command);
}

/** Whether `command` still runs `kestrel-web-upgrade` by name or by the path of its bin file. */
export function stillRunsHostBinary(command: string): boolean {
  return FILE_TOKEN.test(command) || BIN_FILE.test(command);
}

interface ScriptValue {
  name: string;
  start: number;
  end: number;
  raw: string;
}

function scriptValues(source: string): ScriptValue[] {
  const key = /"scripts"\s*:\s*\{/.exec(source);
  if (key === null) return [];
  const out: ScriptValue[] = [];
  const entry = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(,|\})/g;
  entry.lastIndex = key.index + key[0].length;
  for (let match = entry.exec(source); match !== null; match = entry.exec(source)) {
    const name = match[1] ?? "";
    const raw = match[2] ?? "";
    const colon = match[0].indexOf(":");
    const start = match.index + colon + match[0].slice(colon).indexOf('"') + 1;
    out.push({ name, start, end: start + raw.length, raw });
    if (match[3] === "}") break;
  }
  return out;
}

const MARKDOWN = /\.md$/;
const SCANNED_NAMES = [MARKDOWN, /^Dockerfile/, /\.service$/, /\.ya?ml$/, /\.sh$/, /^Makefile$/, /^Procfile$/, /\.json$/, /\.[cm]?js$/, /\.[cm]?ts$/];
const SKIPPED_FILES = new Set(["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]);
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".nuxt", ".output"]);

function scannedFiles(dir: string, top: boolean, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !(top && entry.name === "sandbox")) scannedFiles(path, false, out);
      continue;
    }
    if (!entry.isFile() || SKIPPED_FILES.has(entry.name)) continue;
    if (SCANNED_NAMES.some((pattern) => pattern.test(entry.name))) out.push(path);
  }
  return out;
}

function warning(id: string, where: Finding["where"], message: string, suggestion: string): Finding {
  return { id, rule: RULE, severity: "warning", tier: "source", where, message, suggestion, fix: { kind: "manual" }, docs: DOCS };
}

function scriptFindings(ctx: SourceRuleContext): Finding[] {
  const file = packageJsonPath(ctx);
  const source = ctx.readFile(file);
  if (source === undefined) return [];
  const findings: Finding[] = [];
  for (const value of scriptValues(source)) {
    const rewritten = rewriteHostBinary(value.raw);
    if (rewritten === value.raw && runsUnscopedHostBinary(value.raw)) {
      findings.push({ id: `${RULE}:script:${value.name}`, rule: RULE, severity: "error", tier: "source", where: { file }, message: `script "${value.name}" runs ${BINARY} through a runner that can fetch an unrelated registry package of that name, in a form this rule cannot rewrite: ${value.raw}`, suggestion: SAFE_COMMANDS, fix: { kind: "manual" }, docs: DOCS });
      continue;
    }
    if (stillRunsHostBinary(rewritten)) {
      findings.push(warning(`${RULE}:unrewritten:${value.name}`, { file }, `script "${value.name}" still runs ${BINARY}, which kestrel-web 3.0.0 removed, in a form this rule cannot rewrite: ${rewritten}`, `run "${REPLACEMENT} …" instead`));
    }
    if (rewritten === value.raw) continue;
    const unscoped = runsUnscopedHostBinary(value.raw) ? "; through an unscoped npx it would fetch and run an unrelated registry package of that name" : "";
    findings.push(
      autoFinding(`${RULE}:script:${value.name}`, RULE, { file }, `script "${value.name}" runs ${BINARY}, which kestrel-web 3.0.0 removed${unscoped}: ${value.raw}`, `run "${rewritten}" instead`, [{ file, start: value.start, end: value.end, text: rewritten }], DOCS),
    );
  }
  return findings;
}

function otherFileFindings(ctx: SourceRuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of scannedFiles(ctx.root, true)) {
    const source = ctx.readFile(file);
    if (source === undefined) continue;
    source.split("\n").forEach((line, i) => {
      const where = { file, line: i + 1 };
      const id = `${RULE}:${file}:${i + 1}`;
      if (runsUnscopedHostBinary(line)) {
        findings.push({ id, rule: RULE, severity: "error", tier: "source", where, message: `${basename(file)} line ${i + 1} runs ${BINARY} through a runner that can fetch an unrelated registry package of that name`, suggestion: SAFE_COMMANDS, fix: { kind: "manual" }, docs: DOCS });
      } else if (MARKDOWN.test(file)) {
        return;
      } else if (FILE_TOKEN.test(line)) {
        findings.push(warning(id, where, `${basename(file)} line ${i + 1} runs ${BINARY}, which kestrel-web 3.0.0 removed`, `change the line to: ${rewriteHostBinary(line.replace(FILE_TOKEN, (_m, sep: string) => `${sep}${REPLACEMENT}`)).trim()}`));
      } else if (BIN_FILE.test(line)) {
        findings.push(warning(id, where, `${basename(file)} line ${i + 1} runs the ${BINARY} bin file kestrel-web 3.0.0 removed`, `run node_modules/.bin/kestrel upgrade … instead`));
      }
    });
  }
  return findings;
}

/**
 * `scripts/host-binary`: rewrites `kestrel-web-upgrade` to `kestrel upgrade` in `package.json` scripts,
 * behind any runner or environment prefix, and warns about it in the project's other command files; a line that
 * runs it through a runner that can fetch the unscoped name is an error there, also in Markdown. It never
 * edits a dependency: kestrel's own `deps/kestrel-range` adds `@michaelthielemann/kestrel-cli`.
 */
export const hostBinaryRule: SourceRule = {
  id: RULE,
  needs: "source",
  check(ctx) {
    return [...scriptFindings(ctx), ...otherFileFindings(ctx)];
  },
};
