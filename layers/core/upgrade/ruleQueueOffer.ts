import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AskFix, Edit, Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { addStringToNamedExportArray } from "./edits";
import { docsAnchor, findFeaturesArrayFile, presetOptionsCast } from "./ruleHelpers";

const RULE_ID = "offer/event-queue";
const SERVERLESS_MARKERS = ["vercel.json", "netlify.toml", "wrangler.toml", "serverless.yml", "template.yaml"];
const CONSEQUENCES = "uploads and other requests answer at once; image variants, the login audit and any other subscriber not published inline run in the worker moments later, retried with backoff; a failing subscriber no longer fails the request that emitted the event; every event may reach a pipeline more than once; the queue lives in the database and switching back later needs it drained first";

function offerUnmetConditions(ctx: Parameters<Rule["check"]>[0]): string[] {
  const unmet: string[] = [];
  const cast = presetOptionsCast(ctx);
  const features = cast?.features;
  if (features === undefined) return ["could not read the project's own features list"];
  if (features.includes("eventsQueue")) return ["already on the queue"];
  if (!ctx.project.input.config.triggers.some((t) => "event" in t)) unmet.push("no event trigger to move to the queue");
  const marker = SERVERLESS_MARKERS.find((m) => existsSync(join(ctx.root, m)));
  if (marker !== undefined) unmet.push(`"${marker}" suggests the process does not stay alive between requests`);
  return unmet;
}

function switchEdits(ctx: Parameters<Rule["check"]>[0]): { edits: Edit[]; missing: string | undefined } {
  const file = findFeaturesArrayFile(ctx);
  if (file === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const source = ctx.readFile(file);
  if (source === undefined) return { edits: [], missing: "shared/model.ts (the project's features array)" };
  const edit = addStringToNamedExportArray(file, source, "features", "eventsQueue");
  if (edit === undefined) return { edits: [], missing: "shared/model.ts's features array" };
  return { edits: [edit], missing: undefined };
}

/**
 * Replaces kestrel's own `offer/event-queue` for a layer project (registered through the plugin's
 * `overrides`, not a second id): its own switch codemod expects a literal `modules: [...]` array, which a
 * `presetModuleConfig()` project never has, so it always reports "cannot switch" there. This version
 * offers the one-line `features` array change instead.
 */
export const queueOfferRule: Rule = {
  id: RULE_ID,
  async check(ctx) {
    const unmet = offerUnmetConditions(ctx);
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
      const fix: AskFix = { kind: "ask", question: "switch-to-queue", prompt: `switch event delivery to the queue? ${CONSEQUENCES}`, choices: ["no", "yes"], defaultValue: "no" };
      return [{ id: RULE_ID, rule: RULE_ID, severity: "info", tier: "source", where: {}, message: "can switch to the queue", suggestion: "run fix to be asked; check never decides this on its own", fix, docs: docsAnchor("preset-event-queue-offer") }];
    }
    if (answer !== "yes") return [];
    const { edits, missing } = switchEdits(ctx);
    if (ctx.previewBoot && edits.length > 0) {
      const preview = await ctx.previewBoot(edits);
      if (preview === undefined || preview.errors.length > 0) {
        return [
          {
            id: RULE_ID,
            rule: RULE_ID,
            severity: "info",
            tier: "source",
            where: {},
            message: preview === undefined ? "could not verify the switch: the edited copy could not be reloaded" : `the switch fails to boot: ${preview.errors.map((e) => e.reason).join("; ")}`,
            suggestion: "run fix again to re-verify, or resolve the boot error above",
            fix: { kind: "manual" },
            docs: docsAnchor("preset-event-queue-offer"),
          },
        ];
      }
    }
    const findings: Finding[] = [
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
    return findings;
  },
};
