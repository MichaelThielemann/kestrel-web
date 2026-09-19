import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOptions } from "./src/args.mjs";
import { DEFAULT_FEATURES } from "./src/features.mjs";
import { PromptError, collectAnswers } from "./src/prompts.mjs";

interface Script {
  answers: string[];
  secrets: string[];
}

function scriptedIo({ answers, secrets }: Script) {
  const asked: string[] = [];
  const written: string[] = [];
  const pendingAnswers = [...answers];
  const pendingSecrets = [...secrets];
  const io = {
    ask: (question: string) => {
      asked.push(question);
      return Promise.resolve(pendingAnswers.shift() ?? "");
    },
    secret: (question: string) => {
      asked.push(question);
      return Promise.resolve(pendingSecrets.shift() ?? "");
    },
    write: (line: string) => {
      written.push(line);
    },
  };
  return { io, asked, written };
}

function options(argv: string[]) {
  const { options: resolved, errors } = resolveOptions(argv, {});
  expect(errors).toEqual([]);
  return resolved;
}

describe("collectAnswers", () => {
  it("takes every default when the operator only presses enter", async () => {
    const { io } = scriptedIo({ answers: [], secrets: ["longenough", "longenough"] });
    const answers = await collectAnswers(io, options([]), "npm");
    expect(answers).toMatchObject({
      directory: resolve("my-site"),
      name: "my-site",
      packageManager: "npm",
      defaultLocale: "en",
      locales: ["en"],
      features: DEFAULT_FEATURES,
      blobstore: "filesystem",
      adminUser: "admin",
      password: "longenough",
      generated: false,
    });
  });

  it("reads directory, name, manager, locales, features, blobstore and user from the answers", async () => {
    const { io } = scriptedIo({
      answers: ["Shop Site", "shop", "pnpm", "de", "en, fr", "references,audit", "s3", "root"],
      secrets: ["hunter2hunter2", "hunter2hunter2"],
    });
    const answers = await collectAnswers(io, options([]), "npm");
    expect(answers).toMatchObject({
      directory: resolve("Shop Site"),
      name: "shop",
      packageManager: "pnpm",
      defaultLocale: "de",
      locales: ["de", "en", "fr"],
      features: ["references", "audit"],
      blobstore: "s3",
      adminUser: "root",
    });
  });

  it("asks nothing that a flag already answers", async () => {
    const { io, asked } = scriptedIo({ answers: [], secrets: [] });
    const answers = await collectAnswers(
      io,
      options(["site", "--name", "My Site", "--pm", "bun", "--locales", "fr,de", "--features", "images", "--blobstore", "s3", "--admin-user", "ops", "--admin-password", "longenough"]),
      "npm",
    );
    expect(asked).toEqual([]);
    expect(answers).toMatchObject({
      name: "my-site",
      packageManager: "bun",
      defaultLocale: "fr",
      locales: ["fr", "de"],
      features: ["images"],
      blobstore: "s3",
      adminUser: "ops",
      password: "longenough",
    });
  });

  it("repeats the password prompt until both entries match and are long enough", async () => {
    const { io, written } = scriptedIo({ answers: [], secrets: ["short", "longenough", "different1", "longenough", "longenough"] });
    const answers = await collectAnswers(io, options([]), "pnpm");
    expect(answers.password).toBe("longenough");
    expect(written).toContain("the password must have at least 8 characters");
    expect(written).toContain("the two passwords differ");
  });

  it("repeats a prompt whose answer is not usable", async () => {
    const { io, written } = scriptedIo({ answers: ["", "", "", "Deutsch", "de"], secrets: ["longenough", "longenough"] });
    const answers = await collectAnswers(io, options([]), "pnpm");
    expect(answers.defaultLocale).toBe("de");
    expect(written).toContain('"Deutsch" is not a locale code such as "de" or "pt-BR"');
  });

  it("gives up rather than looping forever", async () => {
    const { io } = scriptedIo({ answers: [], secrets: ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x"] });
    await expect(collectAnswers(io, options([]), "pnpm")).rejects.toBeInstanceOf(PromptError);
  });

  it("generates a password for a non-interactive run and says so", async () => {
    const { io, asked } = scriptedIo({ answers: [], secrets: [] });
    const answers = await collectAnswers(io, options(["--yes"]), "pnpm");
    expect(asked).toEqual([]);
    expect(answers.generated).toBe(true);
    expect(answers.password.length).toBeGreaterThanOrEqual(8);
    expect(answers.features).toEqual(DEFAULT_FEATURES);
  });

  it("refuses a password from a flag that is too short", async () => {
    const { io } = scriptedIo({ answers: [], secrets: [] });
    await expect(collectAnswers(io, options(["--yes", "--admin-password", "short"]), "pnpm")).rejects.toBeInstanceOf(PromptError);
  });
});
