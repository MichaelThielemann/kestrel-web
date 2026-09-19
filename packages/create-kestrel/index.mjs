#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectPackageManager, resolveOptions } from "./src/args.mjs";
import { ALL_FEATURES, DEFAULT_FEATURES } from "./src/features.mjs";
import { createIo } from "./src/io.mjs";
import { collectAnswers } from "./src/prompts.mjs";
import { INSTALL_COMMANDS, RUN_PREFIXES } from "./src/render.mjs";
import { occupants, projectFiles, readVersions, writeProject } from "./src/scaffold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(resolve(HERE, "package.json"), "utf8")).version;

const HELP = `create-kestrel ${VERSION}

  pnpm create kestrel [directory]

  --name <name>            package name (default: the directory name)
  --pm <manager>           pnpm | npm | yarn | bun (default: the manager that started this)
  --locales <list>         comma separated, the first one is the default locale
  --features <list>        comma separated; known: ${ALL_FEATURES.join(", ")}
                           default: ${DEFAULT_FEATURES.join(", ")}
  --blobstore <kind>       filesystem | s3 (s3 writes env placeholders, no credentials)
  --admin-user <name>      username of the bootstrap admin (default: admin)
  --admin-password <pw>    or the KESTREL_ADMIN_PASSWORD environment variable
  --yes                    take every default and never prompt
  --force                  scaffold into a directory that is not empty
  --help, --version
`;

function fail(message) {
  process.stderr.write(`create-kestrel: ${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const { options, errors } = resolveOptions(process.argv.slice(2), process.env);

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (errors.length > 0) {
    fail(errors.join("\n               "));
    return;
  }

  const io = createIo(process.stdin, process.stdout);
  let answers;
  try {
    answers = await collectAnswers(io, options, detectPackageManager(process.env.npm_config_user_agent));
  } finally {
    io.close();
  }

  const directory = answers.directory;
  const taken = occupants(directory);
  if (taken.length > 0 && !options.force) {
    fail(`${relative(process.cwd(), directory) || "the current directory"} is not empty (${taken.slice(0, 3).join(", ")}) — pass --force to scaffold into it anyway`);
    return;
  }

  const files = projectFiles(answers, readVersions(HERE), resolve(HERE, "template"));
  writeProject(directory, files);

  const where = relative(process.cwd(), directory);
  const install = INSTALL_COMMANDS[answers.packageManager];
  const dev = `${RUN_PREFIXES[answers.packageManager]} dev`;

  process.stdout.write(`\nCreated ${files.size} files in ${where || "."}\n\nNext steps\n\n`);
  if (where !== "") process.stdout.write(`  cd ${where}\n`);
  process.stdout.write(`  ${install}\n  ${dev}\n\nThen open http://localhost:3000/admin and log in as "${answers.adminUser}".\n`);
  if (answers.generated) {
    process.stdout.write(`\nThe generated admin password is shown here once and stored nowhere in clear text:\n\n  ${answers.password}\n`);
  }
}

await main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
