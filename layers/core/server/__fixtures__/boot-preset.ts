import { resolve } from "node:path";
import { boot, defineConfig, type Kestrel } from "@michaelthielemann/kestrel";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig, type Feature } from "#kestrel/pipelines";

export const ADMIN_PASSWORD = "change-me";
export const ADMIN_PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

export interface BootedPreset {
  kestrel: Kestrel;
  /** Signs in and answers the bearer headers of the new session. */
  login(username: string, password: string, code?: string): Promise<Record<string, string>>;
  /** Runs the pipeline behind `trigger` ("METHOD /path") with the given input. */
  call(pipeline: string, trigger: string, input?: { headers?: Record<string, string>; body?: Record<string, unknown>; query?: Record<string, unknown>; params?: Record<string, string>; ip?: string }): ReturnType<Kestrel["run"]>;
}

export interface BootOptions {
  /** Features on top of the playground's own. */
  features?: readonly Feature[];
  mfa?: { secretKey: string; enforce?: "all" | "none" };
  session?: { identifier?: "username" | "email" };
  buildAssetsPath?: string;
}

/** Boots the playground's content model through the preset into `appRoot`, with the given roles. */
export async function bootPlaygroundPreset(appRoot: string, roles: { roles: Record<string, string[]>; anonymous: string[] } = { roles: { admin: ["*"], editor: ["pages.*"] }, anonymous: ["media.read"] }, options: BootOptions = {}): Promise<BootedPreset> {
  const { contentModel, contentTypes, features: playgroundFeatures } = await import("../../../../playground/shared/model");
  const features = [...playgroundFeatures, ...(options.features ?? [])];
  const { default: collectionsUi } = await import("../../../../playground/shared/collections-ui");
  const { default: fieldTypes } = await import("../../../../playground/shared/field-types");
  const moduleConfig = presetModuleConfig({
    dataDir: appRoot,
    blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
    model: contentModel,
    features,
    collectionsUi,
    fieldTypes,
    roles,
    bootstrap: { username: "admin", passwordHash: ADMIN_PASSWORD_HASH },
    ...(options.mfa === undefined ? {} : { mfa: options.mfa }),
    ...(options.session === undefined ? {} : { session: options.session }),
    ...(options.buildAssetsPath === undefined ? {} : { buildAssetsPath: options.buildAssetsPath }),
  });
  const preset = definePreset({ modules: moduleConfig, features, collections: contentTypes, collectionsUi, fieldTypes });
  const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
  const kestrel = await boot({ config: { ...config, http: null }, modules: presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights }), pipelines: preset.pipelines });
  await kestrel.start();
  const call: BootedPreset["call"] = (pipeline, trigger, input = {}) => kestrel.run(pipeline, { trigger: { kind: "http", name: trigger }, ...input });
  return {
    kestrel,
    call,
    async login(username, password, code) {
      const run = await call("login", "POST /login", { body: code === undefined ? { username, password } : { username, password, code } });
      const token = typeof run.result === "object" && run.result !== null && "token" in run.result ? run.result.token : undefined;
      if (typeof token !== "string") throw new Error(`expected ${username} to sign in, got ${run.status} ${run.error ?? ""}`);
      return { authorization: `Bearer ${token}` };
    },
  };
}
