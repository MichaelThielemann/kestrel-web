import { relative } from "node:path";
import { arrayElements, isAstNode, objectProperty, parseTs, span, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, Edit } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, Rule, SourceRule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { pipelineSteps } from "@michaelthielemann/kestrel/definePipeline";
import { checkPreset } from "../pipelines/checkPreset";
import { insertAfterElement } from "./arraySplices";
import { consumerExpressions } from "./consumerRules";
import { layerLocateModelFields, layerLocateSteps } from "./locators";
import { autoFinding, docsAnchor, fileForPipeline, manualFinding, presetOptionsCast, sharedModelFile } from "./ruleHelpers";
import { parentFieldOf } from "../pipelines/paths";

const RULE = "preset/override-path-steps";
const CONTENT_WRITE = /^content\.(?:create|update|remove|removeTranslation|set):/;
const INDEX_STEP = /^site\.(?:indexPath:|indexMounts$)/;
const ANNOUNCE_STEP = "site.announcePaths";
const CONTENT_READ = /^content\.(?:list|get):/;

/** A step of `site-default`'s path index, which an override must keep at the preset's position. */
export function isPathStep(step: string): boolean {
  return INDEX_STEP.test(step) || step === ANNOUNCE_STEP || step.startsWith("site.attachPaths:") || step.startsWith("site.route:");
}

interface Located {
  top: AstNode;
  values: (string | undefined)[];
  group: { index: number; array: AstNode } | undefined;
}

function locate(root: AstNode, pipelineName: string, locateSteps: typeof layerLocateSteps): Located | undefined {
  const [top] = locateSteps(root, pipelineName);
  if (top === undefined) return undefined;
  const elements = arrayElements(top);
  const values = elements.map((el) => stringValue(el));
  let group: Located["group"];
  elements.forEach((el, index) => {
    if (group !== undefined || !isAstNode(el)) return;
    const atomic = objectProperty(el, "atomic");
    if (atomic === undefined || atomic.type !== "ArrayExpression") return;
    if (arrayElements(atomic).some((member) => CONTENT_WRITE.test(stringValue(member) ?? ""))) group = { index, array: atomic };
  });
  return { top, values, group };
}

function literal(step: string): string {
  return JSON.stringify(step);
}

type Insertion = { kind: "edits"; edits: Edit[] } | { kind: "waiting" } | { kind: "manual"; reason: string };

function insertions(file: string, source: string, located: Located, missing: readonly string[]): Insertion {
  const edits: Edit[] = [];
  for (const step of missing) {
    if (INDEX_STEP.test(step) || step === ANNOUNCE_STEP) {
      if (located.group === undefined) return { kind: "waiting" };
      const splices = INDEX_STEP.test(step)
        ? insertAfterElement(source, located.group.array, arrayElements(located.group.array).length - 1, [literal(step)])
        : insertAfterElement(source, located.top, located.group.index, [literal(step)]);
      edits.push(...splices.map((splice) => ({ file, ...splice })));
      continue;
    }
    const anchor = step.startsWith("site.attachPaths:")
      ? located.values.findIndex((value) => CONTENT_READ.test(value ?? ""))
      : located.values.findIndex((value) => value?.startsWith("site.resolve:") === true) - 1;
    if (anchor < 0) return { kind: "manual", reason: `no place for "${step}" was found in the override` };
    edits.push(...insertAfterElement(source, located.top, anchor, [literal(step)]).map((splice) => ({ file, ...splice })));
  }
  return { kind: "edits", edits };
}

/**
 * An override of a pipeline the preset wires into `site-default`'s path index — a routed collection's write,
 * list or read, `resolvePage`, `setSettings` with mounted collections — that lacks one of its path steps:
 * boot rejects a write that does not end its atomic group with the index and announce right after it, and a
 * read without `site.attachPaths` answers without `_paths`. Inserts each missing step at the preset's
 * position when the override's own step array is located; waits for `preset/override-group` when the write
 * has no atomic group yet; manual otherwise.
 */
export const overridePathStepsRule: Rule = {
  id: RULE,
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    if (cast === undefined) return [];
    const names = Object.keys(cast.overrides ?? {});
    if (names.length === 0) return [];
    const defaults = checkPreset({ ...cast, overrides: {} }).preset.pipelines;
    const locateSteps = ctx.locateSteps ?? layerLocateSteps;
    const findings: Finding[] = [];
    for (const name of names) {
      const preset = defaults.find((pipeline) => pipeline.name === name);
      const own = ctx.project.input.pipelines.find((pipeline) => pipeline.name === name);
      if (preset === undefined || own === undefined) continue;
      const kept = new Set(pipelineSteps(own.steps));
      const missing = pipelineSteps(preset.steps).filter((step) => isPathStep(step) && !kept.has(step));
      if (missing.length === 0) continue;
      const id = `${RULE}:${name}`;
      const where = { pipeline: name };
      const message = `override for "${name}" lacks ${missing.map((step) => `"${step}"`).join(", ")}, which keep${missing.length === 1 ? "s" : ""} the public paths of what it writes or reads`;
      const docs = docsAnchor("preset-override-path-steps");
      const file = fileForPipeline(ctx, name);
      const source = file === undefined ? undefined : ctx.readFile(file);
      const located = file === undefined || source === undefined ? undefined : locate(parseTs(source), name, locateSteps);
      if (file === undefined || source === undefined || located === undefined) {
        findings.push(manualFinding(id, RULE, where, message, `add them where the preset's own "${name}" runs them`, docs));
        continue;
      }
      const result = insertions(file, source, located, missing);
      if (result.kind === "waiting") continue;
      findings.push(
        result.kind === "edits"
          ? autoFinding(id, RULE, where, message, `inserts ${missing.map((step) => `"${step}"`).join(", ")} where the preset's own "${name}" runs ${missing.length === 1 ? "it" : "them"}`, result.edits, docs)
          : manualFinding(id, RULE, where, message, `${result.reason}; add them where the preset's own "${name}" runs them`, docs),
      );
    }
    return findings;
  },
};

function isSlugMember(node: unknown): boolean {
  if (!isAstNode(node) || node.type !== "MemberExpression") return false;
  const property = node.property;
  return isAstNode(property) && property.type === "Identifier" && property.name === "slug";
}

function startsWithSlash(node: unknown): boolean {
  return isAstNode(node) && ((node.type === "StringLiteral" || node.type === "Literal") && typeof node.value === "string" && node.value.endsWith("/"));
}

function buildsUrlFromSlug(root: AstNode): boolean {
  let found = false;
  walk(root, (node) => {
    if (found) return;
    if (node.type === "TemplateLiteral") {
      const quasis = Array.isArray(node.quasis) ? node.quasis.filter(isAstNode) : [];
      const expressions = Array.isArray(node.expressions) ? node.expressions : [];
      expressions.forEach((expression, i) => {
        const before: unknown = quasis[i]?.value;
        const raw: unknown = typeof before === "object" && before !== null ? Reflect.get(before, "raw") : undefined;
        if (typeof raw === "string" && raw.endsWith("/") && isSlugMember(expression)) found = true;
      });
    }
    if (node.type === "BinaryExpression" && node.operator === "+" && startsWithSlash(node.left) && isSlugMember(node.right)) found = true;
  });
  return found;
}

/**
 * Consumer code that builds a page URL from its slug (`` `/${page.slug}` ``, `"/" + page.slug`): a subpage,
 * a mounted collection's document and a page in another locale have a longer path than their slug. Information
 * only: read the document's `_paths`, or a link's resolved `_links` entry, instead.
 */
export const slugUrlRule: SourceRule = {
  id: "consumer/slug-url",
  needs: "source",
  check(ctx) {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const { file, root } of consumerExpressions(ctx)) {
      if (seen.has(file) || !buildsUrlFromSlug(root)) continue;
      seen.add(file);
      findings.push({
        id: `consumer/slug-url:${relative(ctx.root, file)}`,
        rule: "consumer/slug-url",
        severity: "info",
        tier: "source",
        where: { file },
        message: `${relative(ctx.root, file)} builds a URL from a slug; a subpage's or a mounted document's public path is longer than its slug`,
        suggestion: "read the document's _paths (locale → public path), or the link's _links entry, instead of building the URL from the slug",
        fix: { kind: "none" },
        docs: docsAnchor("consumer-slug-url"),
      });
    }
    return findings;
  },
};

const PARENT_OFFER = "model/parent-offer";
const PARENT_FIELD = 'parent: { type: "ref", to: "pages" }';

function insertLastProperty(file: string, source: string, fields: AstNode, text: string): Edit | undefined {
  const properties = Array.isArray(fields.properties) ? fields.properties.filter(isAstNode) : [];
  const last = properties.at(-1);
  if (last === undefined) return undefined;
  const end = span(last).end;
  const lineStart = source.lastIndexOf("\n", span(last).start - 1) + 1;
  const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
  const comma = /^\s*,/.test(source.slice(end)) ? source.indexOf(",", end) + 1 : end;
  return { file, start: comma, end: comma, text: `${comma === end ? "," : ""}\n${indent}${text},` };
}

/**
 * Offers `pages` a parent field, which turns on subpages: a page's path then starts with its parent's.
 * Asked once, default no; a yes adds `parent: { type: "ref", to: "pages" }` to `pages.fields` in
 * `shared/model.ts`.
 */
export const parentOfferRule: Rule = {
  id: PARENT_OFFER,
  check(ctx) {
    const cast = presetOptionsCast(ctx);
    const pages = cast?.collections?.pages;
    if (pages === undefined || parentFieldOf("pages", pages) !== undefined || "parent" in pages.fields) return [];
    const docs = docsAnchor("model-parent-offer");
    const where = { file: "shared/model.ts" };
    const message = "pages have no parent field; with one, a page can sit below another and its path starts with the parent's";
    const answer = ctx.answers.get(PARENT_OFFER);
    if (answer === undefined) {
      return [{
        id: PARENT_OFFER,
        rule: PARENT_OFFER,
        severity: "info",
        tier: "source",
        where,
        message,
        suggestion: "run fix to be asked",
        fix: { kind: "ask", question: PARENT_OFFER, prompt: `add ${PARENT_FIELD} to pages, so pages can have subpages?`, choices: ["no", "yes"], closedChoices: true, defaultValue: "no" },
        docs,
      }];
    }
    if (answer !== "yes") return [];
    const file = sharedModelFile(ctx);
    const source = ctx.readFile(file);
    const fields = source === undefined ? undefined : (ctx.locateModelFields ?? layerLocateModelFields)(parseTs(source), { use: "@michaelthielemann/kestrel-content-default", typeName: "pages" });
    const edit = source === undefined || fields === undefined ? undefined : insertLastProperty(file, source, fields, PARENT_FIELD);
    return [edit === undefined
      ? manualFinding(PARENT_OFFER, PARENT_OFFER, where, message, `add ${PARENT_FIELD} to pages.fields yourself`, docs)
      : autoFinding(PARENT_OFFER, PARENT_OFFER, where, message, `adds ${PARENT_FIELD} to pages.fields`, [edit], docs)];
  },
};
