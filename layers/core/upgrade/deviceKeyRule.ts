import type { Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { deploymentFiles } from "./consumerRules";
import { docsAnchor } from "./ruleHelpers";

const RULE = "ops/device-key";
const REMEMBER_PREFIX = "ratelimit.rememberDevice:";
const MFA_MODULE = "@michaelthielemann/kestrel-mfa-totp";
const DEVICE_KEY = /\bKESTREL_DEVICE_KEY\b/;

/**
 * A project whose login remembers known devices, without the `mfa` feature whose keys would sign their cookies and
 * without `KESTREL_DEVICE_KEY` in any env or deployment file, signs them with a random key per process: every
 * restart and every other instance forgets the known devices. The finding asks the operator to set the key.
 */
export const deviceKeyRule: Rule = {
  id: RULE,
  check(ctx) {
    const { modules } = ctx.project.input.config;
    const remembers = ctx.project.input.pipelines.some((def) => pipelineSteps(def.steps).some((step) => step.startsWith(REMEMBER_PREFIX)));
    if (!remembers || modules.some((m) => m.use === MFA_MODULE)) return [];
    const files: string[] = [];
    deploymentFiles(ctx.root, files);
    if (files.some((file) => DEVICE_KEY.test(ctx.readFile(file) ?? ""))) return [];
    const finding: Finding = {
      id: RULE,
      rule: RULE,
      severity: "warning",
      tier: "source",
      where: { file: ctx.project.configFile },
      message: "the login remembers known devices, but neither the mfa feature nor KESTREL_DEVICE_KEY provides a key for their cookies, so the server signs them with a random key per process",
      suggestion: "set KESTREL_DEVICE_KEY (64 hex digits, openssl rand -hex 32) in the production environment and name it in .env.example, so known devices survive a restart and are recognised by every instance",
      fix: { kind: "manual" },
      docs: docsAnchor("ops-device-key"),
    };
    return [finding];
  },
};
