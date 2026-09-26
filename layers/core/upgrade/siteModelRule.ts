import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, span, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, Edit } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, Rule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { siteModelProblem } from "../server/utils/site-model";
import { insertLastProperty } from "./pathRules";
import { autoFinding, docsAnchor, manualFinding, sharedModelFile } from "./ruleHelpers";

const RULE = "preset/site-model-options";
const OPTIONS = ["homeSlug", "prefixPrimary"] as const;

function exportedConst(source: string, name: string): unknown {
  const match = new RegExp(`export\\s+const\\s+${name}\\s*(?::[^=]+)?=\\s*(true|false|"[^"]*"|'[^']*')`).exec(source);
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  return raw === "true" ? true : raw === "false" ? false : raw.slice(1, -1);
}

function modelImport(root: AstNode): AstNode | undefined {
  let found: AstNode | undefined;
  walk(root, (node) => {
    if (found !== undefined || node.type !== "ImportDeclaration") return;
    const from = node.source;
    if (isAstNode(from) && typeof from.value === "string" && /(^|\/)shared\/model(\.ts)?$/.test(from.value) && node.importKind !== "type") found = node;
  });
  return found;
}

function importedNames(declaration: AstNode): string[] {
  const specifiers = Array.isArray(declaration.specifiers) ? declaration.specifiers.filter(isAstNode) : [];
  return specifiers.map((specifier) => (isAstNode(specifier.local) && typeof specifier.local.name === "string" ? specifier.local.name : "")).filter(Boolean);
}

function importEdit(file: string, declaration: AstNode, names: readonly string[]): Edit | undefined {
  const specifiers = Array.isArray(declaration.specifiers) ? declaration.specifiers.filter(isAstNode) : [];
  const last = specifiers.at(-1);
  if (last === undefined || names.length === 0) return undefined;
  const end = span(last).end;
  return { file, start: end, end, text: names.map((name) => `, ${name}`).join("") };
}

function insertProperties(file: string, source: string, object: AstNode, names: readonly string[]): Edit | undefined {
  const { start, end } = span(object);
  if (!source.slice(start, end).includes("\n")) {
    const properties = Array.isArray(object.properties) ? object.properties.filter(isAstNode) : [];
    const last = properties.at(-1);
    if (last === undefined) return undefined;
    const at = span(last).end;
    return { file, start: at, end: at, text: names.map((name) => `, ${name}`).join("") };
  }
  const lineStart = source.lastIndexOf("\n", end - 1);
  const indent = /^\n?([ \t]*)/.exec(source.slice(lineStart))?.[1] ?? "";
  return insertLastProperty(file, source, object, names.join(`,\n${indent}  `));
}

function callOptions(root: AstNode, callee: string): AstNode | undefined {
  const [call] = findCalls(root, callee);
  const options = call === undefined ? undefined : firstArgument(call);
  return options?.type === "ObjectExpression" ? options : undefined;
}

function edits(file: string, source: string): Edit[] | undefined {
  const root = parseTs(source);
  const declaration = modelImport(root);
  const moduleOptions = callOptions(root, "presetModuleConfig");
  if (declaration === undefined || moduleOptions === undefined) return undefined;
  const imported = new Set(importedNames(declaration));
  const out: Edit[] = [];
  const missingInModules = OPTIONS.filter((name) => objectProperty(moduleOptions, name) === undefined);
  const presetOptions = callOptions(root, "definePreset");
  const missingInPreset = presetOptions !== undefined && objectProperty(presetOptions, "homeSlug") === undefined;
  const needed = OPTIONS.filter((name) => !imported.has(name) && (missingInModules.includes(name) || (name === "homeSlug" && missingInPreset)));
  const imports = importEdit(file, declaration, needed);
  if (imports !== undefined) out.push(imports);
  if (missingInModules.length > 0) {
    const edit = insertProperties(file, source, moduleOptions, missingInModules);
    if (edit === undefined) return undefined;
    out.push(edit);
  }
  if (presetOptions !== undefined && missingInPreset) {
    const edit = insertProperties(file, source, presetOptions, ["homeSlug"]);
    if (edit === undefined) return undefined;
    out.push(edit);
  }
  return out;
}

/**
 * `presetModuleConfig()` takes `homeSlug` and `prefixPrimary` for `site-default`, which a 2.x project does not
 * pass: the server then refuses to boot when `shared/model` declares `prefixPrimary = true` or a home slug other
 * than `"home"`. Passes both from `shared/model` to `presetModuleConfig()` and `homeSlug` to `definePreset()`,
 * as an error when the project would not boot, a warning otherwise.
 */
export const siteModelOptionsRule: Rule = {
  id: RULE,
  check(ctx): Finding[] {
    const modelSource = ctx.readFile(sharedModelFile(ctx));
    const configSource = ctx.readFile(ctx.project.configFile);
    if (modelSource === undefined || configSource === undefined) return [];
    const prefixPrimary = exportedConst(modelSource, "prefixPrimary");
    const homeSlug = exportedConst(modelSource, "homeSlug");
    if (typeof prefixPrimary !== "boolean" || typeof homeSlug !== "string") return [];
    const root = parseTs(configSource);
    const moduleOptions = callOptions(root, "presetModuleConfig");
    const presetOptions = callOptions(root, "definePreset");
    const passes = moduleOptions !== undefined && OPTIONS.every((name) => objectProperty(moduleOptions, name) !== undefined) && (presetOptions === undefined || objectProperty(presetOptions, "homeSlug") !== undefined);
    if (passes) return [];
    const problem = siteModelProblem(ctx.project.input.config.modules, { prefixPrimary, homeSlug });
    const message = problem ?? "presetModuleConfig() does not take homeSlug and prefixPrimary from shared/model, so site-default's URLs only match the site while both keep their defaults";
    const where = { file: "kestrel.config.ts" };
    const docs = docsAnchor("preset-site-model-options");
    const planned = moduleOptions === undefined ? undefined : edits(ctx.project.configFile, configSource);
    const finding = planned === undefined
      ? manualFinding(RULE, RULE, where, message, "pass homeSlug and prefixPrimary from shared/model to presetModuleConfig(), and homeSlug to definePreset()", docs)
      : autoFinding(RULE, RULE, where, message, "passes homeSlug and prefixPrimary from shared/model to presetModuleConfig(), and homeSlug to definePreset()", planned, docs);
    return [{ ...finding, severity: problem === undefined ? "warning" : "error" }];
  },
};
