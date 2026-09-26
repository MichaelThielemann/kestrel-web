import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { Api, isRecord } from "./api.ts";
import { ADMIN_STATE, BASE_URL, EDITOR_STATE, SEED_FILE } from "./env.ts";
import type { Seed } from "./seed.ts";

const SEED_KEYS = ["photo", "spare", "home", "about", "team", "projects", "news", "draft", "post"] as const;

function readJson(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${file} holds no object`);
  return parsed;
}

function readSeed(): Seed {
  const parsed = readJson(SEED_FILE);
  const seed: Partial<Record<(typeof SEED_KEYS)[number], string>> = {};
  for (const key of SEED_KEYS) {
    const value = parsed[key];
    if (typeof value !== "string") throw new Error(`the seed file has no ${key}`);
    seed[key] = value;
  }
  return { photo: seed.photo ?? "", spare: seed.spare ?? "", home: seed.home ?? "", about: seed.about ?? "", team: seed.team ?? "", projects: seed.projects ?? "", news: seed.news ?? "", draft: seed.draft ?? "", post: seed.post ?? "" };
}

function sessionFrom(stateFile: string, baseUrl: string): Api {
  const cookies = readJson(stateFile).cookies;
  const cookie = Array.isArray(cookies) ? cookies.find((entry: unknown) => isRecord(entry) && entry.name === "kestrel_token") : undefined;
  const api = new Api(baseUrl);
  api.token = isRecord(cookie) && typeof cookie.value === "string" ? cookie.value : null;
  return api;
}

/** Test fixtures: the seeded ids and API clients sharing the admin's and the editor's stored sessions. */
export const test = base.extend<{ seed: Seed; adminApi: Api; editorApi: Api }>({
  // eslint-disable-next-line no-empty-pattern
  seed: async ({}, use) => {
    await use(readSeed());
  },
  adminApi: async ({ baseURL }, use) => {
    await use(sessionFrom(ADMIN_STATE, baseURL ?? BASE_URL));
  },
  editorApi: async ({ baseURL }, use) => {
    await use(sessionFrom(EDITOR_STATE, baseURL ?? BASE_URL));
  },
});

export { expect };
