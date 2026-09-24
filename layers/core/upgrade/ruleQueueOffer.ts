import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { objectProperty, parseTs, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AskFix, Edit, Finding, Rule, RuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { BootCheck } from "@michaelthielemann/kestrel";
import { checkPreset } from "../pipelines/checkPreset";
import { addStringToNamedExportArray } from "./edits";
import { docsAnchor, findFeaturesArrayFile, packageJsonPath, presetOptionsCast } from "./ruleHelpers";

const RULE_ID = "offer/event-queue";
const SERVERLESS_MARKER_FILES = ["vercel.json", "netlify.toml", "wrangler.toml", "serverless.yml", "template.yaml"];
const CONSEQUENCES = "uploads and other requests answer at once; a subscriber not named in relayPipelines runs in the worker moments later, retried with backoff, so it can be missing for a few seconds; a failing subscriber no longer fails the request that emitted the event; every event may reach a pipeline more than once; programmatic events.on subscribers stop seeing pipeline-emitted events; the queue lives in the database and switching back later needs it drained first";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nitroPresetMarker(ctx: RuleContext): string | undefined {
  const source = ctx.readFile(join(ctx.root, "nuxt.config.ts"));
  if (source === undefined) return undefined;
  const root = parseTs(source);
  let preset: string | undefined;
  walk(root, (node) => {
    if (preset !== undefined || node.type !== "ObjectExpression") return;
    const nitro = objectProperty(node, "nitro");
    if (nitro === undefined || nitro.type !== "ObjectExpression") return;
    const presetNode = objectProperty(nitro, "preset");
    if (presetNode !== undefined) preset = stringValue(presetNode) ?? "(computed)";
  });
  return preset === undefined ? undefined : `nitro.preset ("${preset}") in nuxt.config.ts`;
}

function nitroPresetScriptMarker(ctx: RuleContext): string | undefined {
  const source = ctx.readFile(packageJsonPath(ctx));
  if (source === undefined) return undefined;
  try {
    const scripts: unknown = JSON.parse(source).scripts;
    if (isRecord(scripts) && Object.values(scripts).some((s) => typeof s === "string" && s.includes("NITRO_PRESET"))) return "NITRO_PRESET in package.json's scripts";
  } catch {
    return undefined;
  }
  return undefined;
}

function nitroPresetFileMarker(ctx: RuleContext): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(ctx.root);
  } catch {
    return undefined;
  }
  const candidate = entries.find((e) => e === "Dockerfile" || e.startsWith(".env"));
  if (candidate === undefined) return undefined;
  try {
    if (readFileSync(join(ctx.root, candidate), "utf8").includes("NITRO_PRESET")) return `NITRO_PRESET in "${candidate}"`;
  } catch {
    return undefined;
  }
  return undefined;
}

function serverlessMarker(ctx: RuleContext): string | undefined {
  const file = SERVERLESS_MARKER_FILES.find((m) => existsSync(join(ctx.root, m)));
  if (file !== undefined) return `"${file}"`;
  return nitroPresetMarker(ctx) ?? nitroPresetScriptMarker(ctx) ?? nitroPresetFileMarker(ctx);
}

function sqliteEntryConfig(ctx: RuleContext): unknown {
  return ctx.project.input.config.modules.find((m) => m.use.includes("persistence-sqlite"))?.config;
}

function switchEdits(ctx: RuleContext): { edits: Edit[]; missing: string | undefined } {
  const file = findFeaturesArrayFile(ctx);
  if (file === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const source = ctx.readFile(file);
  if (source === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const edit = addStringToNamedExportArray(file, source, "features", "eventsQueue");
  if (edit === undefined) return { edits: [], missing: "shared/model.ts's features array" };
  return { edits: [edit], missing: undefined };
}

function errKey(e: BootCheck["errors"][number]): string {
  return [e.code, e.owner, e.reason, e.module, e.pipeline, e.step, e.path].join(":");
}

interface OfferGate {
  unmet: string[];
  unverified: boolean;
  noBootTier: boolean;
}

async function offerGate(ctx: RuleContext): Promise<OfferGate> {
  const cast = presetOptionsCast(ctx);
  const features = cast?.features;
  if (features === undefined) return { unmet: ["could not read the project's own features list"], unverified: false, noBootTier: false };
  if (features.includes("eventsQueue")) return { unmet: ["already on the queue"], unverified: false, noBootTier: false };
  const unmet: string[] = [];
  if (!ctx.project.input.config.triggers.some((t) => "event" in t)) unmet.push("no event trigger to move to the queue");
  if (!ctx.project.input.modules.some((m) => m.provides.some((c) => c.name === "persistence@1"))) unmet.push("no loaded module provides persistence@1");
  const sqliteConfig = sqliteEntryConfig(ctx);
  if (isRecord(sqliteConfig) && sqliteConfig.file === ":memory:") unmet.push("persistence-sqlite's file is :memory:; a queue that vanishes on restart gains nothing");
  const marker = serverlessMarker(ctx);
  if (marker !== undefined) unmet.push(`${marker} suggests the process does not stay alive between requests`);
  if (unmet.length > 0) return { unmet, unverified: false, noBootTier: false };
  if (!ctx.previewBoot) return { unmet: [], unverified: true, noBootTier: true };
  const { edits } = switchEdits(ctx);
  const preview = await ctx.previewBoot(edits);
  if (preview === undefined) return { unmet: [], unverified: true, noBootTier: false };
  const baseline = new Set(ctx.bootCheck.errors.map(errKey));
  const newErrors = preview.errors.filter((e) => !baseline.has(errKey(e)));
  if (newErrors.length > 0) return { unmet: [`the switch fails to boot: ${newErrors.map((e) => e.reason).join("; ")}`], unverified: false, noBootTier: false };
  return { unmet: [], unverified: false, noBootTier: false };
}

function unverifiedGuidance(noBootTier: boolean): { subject: string; instruction: string } {
  return noBootTier
    ? { subject: "no boot check ran", instruction: "upgrade @michaelthielemann/kestrel to 6 first, then run `fix` again to verify" }
    : { subject: "the edited copy could not be reloaded", instruction: "run `fix` again to verify" };
}

function ownOrOverriddenEventPipelines(ctx: RuleContext): string[] {
  const cast = presetOptionsCast(ctx);
  if (cast === undefined) return [];
  const eventPipelineNames = new Set(ctx.project.input.config.triggers.filter((t) => "event" in t).map((t) => t.pipeline));
  const { preset } = checkPreset({ ...cast, overrides: {} });
  const defaultNames = new Set(preset.pipelines.map((p) => p.name));
  const overrideNames = new Set(Object.keys(cast.overrides ?? {}));
  return [...eventPipelineNames].filter((name) => !defaultNames.has(name) || overrideNames.has(name));
}

/**
 * Replaces kestrel's own `offer/event-queue` for a layer project (registered through the plugin's
 * `overrides`, not a second id): its own switch codemod expects a literal `modules: [...]` array, which a
 * `presetModuleConfig()` project never has, so it always reports "cannot switch" there. This version offers
 * the one-line `features` array change instead. Its own conditions and the layer's deployment markers gate the offer; a
 * switch is written only once a preview actually booted with no new error — no boot tier, or a preview
 * that could not be checked, is never read as "safe", so the question has no default and the answer is
 * refused with the reason named. The idempotency question is asked, per own/overridden event pipeline,
 * ahead of writing it, and any "no" withdraws it.
 */
export const queueOfferRule: Rule = {
  id: RULE_ID,
  async check(ctx) {
    const { unmet, unverified, noBootTier } = await offerGate(ctx);
    if (unmet.length > 0) {
      return [
        {
          id: RULE_ID,
          rule: RULE_ID,
          severity: "info",
          tier: "source",
          where: {},
          message: `cannot switch to the queue: ${unmet.join("; ")}`,
          suggestion: "resolve the conditions above and run check again",
          fix: { kind: "none" },
          docs: docsAnchor("preset-event-queue-offer"),
        },
      ];
    }
    const answer = ctx.answers.get("switch-to-queue");
    if (answer === undefined) {
      let fix: AskFix = { kind: "ask", question: "switch-to-queue", prompt: `switch event delivery to the queue? ${CONSEQUENCES}`, choices: ["no", "yes"], defaultValue: "no" };
      if (unverified) {
        const { subject, instruction } = unverifiedGuidance(noBootTier);
        fix = { kind: "ask", question: "switch-to-queue", prompt: `switch event delivery to the queue? could not verify: ${subject}; ${instruction}. ${CONSEQUENCES}`, choices: ["no", "yes"] };
      }
      return [{ id: RULE_ID, rule: RULE_ID, severity: "info", tier: "source", where: {}, message: "can switch to the queue", suggestion: "run fix to be asked; check never decides this on its own", fix, docs: docsAnchor("preset-event-queue-offer") }];
    }
    if (answer !== "yes") return [];
    if (unverified) {
      const { subject, instruction } = unverifiedGuidance(noBootTier);
      return [
        {
          id: RULE_ID,
          rule: RULE_ID,
          severity: "info",
          tier: "source",
          where: {},
          message: `could not verify the switch: ${subject}`,
          suggestion: instruction,
          fix: { kind: "manual" },
          docs: docsAnchor("preset-event-queue-offer"),
        },
      ];
    }
    const eventPipelines = ownOrOverriddenEventPipelines(ctx);
    const unresolvedIdempotent = eventPipelines.filter((p) => ctx.answers.get(`idempotent:${p}`) === undefined);
    if (unresolvedIdempotent.length > 0) {
      return unresolvedIdempotent.map((p): Finding => {
        const fix: AskFix = { kind: "ask", question: `idempotent:${p}`, prompt: `is pipeline "${p}" safe to run twice for one event, or does it deduplicate by eventId?`, choices: ["no", "yes"], defaultValue: "no" };
        return { id: `${RULE_ID}:idempotent:${p}`, rule: RULE_ID, severity: "info", tier: "source", where: { pipeline: p }, message: `at-least-once delivery may run "${p}" more than once for one event`, suggestion: 'a "no" withdraws the switch', fix, docs: docsAnchor("preset-event-queue-offer") };
      });
    }
    if (eventPipelines.some((p) => ctx.answers.get(`idempotent:${p}`) === "no")) return [];
    const { edits, missing } = switchEdits(ctx);
    return [
      {
        id: RULE_ID,
        rule: RULE_ID,
        severity: "info",
        tier: "source",
        where: {},
        message: "switching event delivery to the queue",
        suggestion: missing !== undefined ? `add "eventsQueue" to the features array by hand; could not locate: ${missing}` : `adds "eventsQueue" to the features array; presetModuleConfig() takes it from there. run pnpm install afterwards`,
        fix: edits.length > 0 ? { kind: "auto", edits } : { kind: "manual" },
        docs: docsAnchor("preset-event-queue-offer"),
      },
    ];
  },
};
