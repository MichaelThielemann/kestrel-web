import { join } from "node:path";
import { findCalls, firstArgument, isAstNode, objectProperty, parseTs, span, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode, Edit } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, SourceRuleContext, SourceRule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { insertLastProperty } from "./pathRules";
import { autoFinding, docsAnchor, manualFinding } from "./ruleHelpers";

const RULE = "preset/schemas-collections-ui";
const CALLS = ["presetSchemas", "definePreset"] as const;
const IMPORT = 'import collectionsUi from "./shared/collections-ui";';

function importedName(root: AstNode): string | undefined {
  let name: string | undefined;
  walk(root, (node) => {
    if (name !== undefined || node.type !== "ImportDeclaration") return;
    const from = node.source;
    if (!isAstNode(from) || typeof from.value !== "string" || !/(^|\/)shared\/collections-ui(\.ts)?$/.test(from.value)) return;
    const specifier = (Array.isArray(node.specifiers) ? node.specifiers.filter(isAstNode) : []).find((s) => s.type === "ImportDefaultSpecifier");
    if (specifier !== undefined && isAstNode(specifier.local) && typeof specifier.local.name === "string") name = specifier.local.name;
  });
  return name;
}

function lastImportEnd(root: AstNode): number | undefined {
  let end: number | undefined;
  walk(root, (node) => {
    if (node.type === "ImportDeclaration") end = Math.max(end ?? 0, span(node).end);
  });
  return end;
}

function insertProperty(file: string, source: string, object: AstNode, text: string): Edit | undefined {
  const { start, end } = span(object);
  if (source.slice(start, end).includes("\n")) return insertLastProperty(file, source, object, text);
  const last = (Array.isArray(object.properties) ? object.properties.filter(isAstNode) : []).at(-1);
  if (last === undefined) return undefined;
  const at = span(last).end;
  return { file, start: at, end: at, text: `, ${text}` };
}

/**
 * A hand-written module list that calls `presetSchemas()` or `definePreset()` without `collectionsUi`: a field the
 * collection UI shows as a link then gets no schema (the server does not start) or no check on write (the server
 * refuses to start since the link check). Passes `shared/collections-ui`'s default export to both calls in
 * `kestrel.config.ts`, importing it when the file does not already.
 */
export const schemasCollectionsUiRule: SourceRule = {
  id: RULE,
  needs: "source",
  check(ctx: SourceRuleContext): Finding[] {
    if (ctx.readFile(join(ctx.root, "shared", "collections-ui.ts")) === undefined) return [];
    const file = join(ctx.root, "kestrel.config.ts");
    const source = ctx.readFile(file);
    if (source === undefined) return [];
    const root = parseTs(source);
    const known = importedName(root);
    const property = known === undefined || known === "collectionsUi" ? "collectionsUi" : `collectionsUi: ${known}`;
    let needsImport = known === undefined;
    const findings: Finding[] = [];
    for (const callee of CALLS) {
      const options = findCalls(root, callee).map((call) => firstArgument(call)).filter((arg): arg is AstNode => arg?.type === "ObjectExpression");
      const missing = options.filter((object) => objectProperty(object, "collectionsUi") === undefined);
      if (missing.length === 0) continue;
      const id = `${RULE}:${callee}`;
      const where = { file: "kestrel.config.ts" };
      const message = callee === "presetSchemas"
        ? "presetSchemas() gets no collectionsUi, so a field the collection UI shows as a link has no schema and the server does not start"
        : "definePreset() gets no collectionsUi, so a field the collection UI shows as a link is not checked on write and the server does not start";
      const edits = missing.map((object) => insertProperty(file, source, object, property));
      const importAt = needsImport ? lastImportEnd(root) : undefined;
      if (edits.some((edit) => edit === undefined) || (needsImport && importAt === undefined)) {
        findings.push(manualFinding(id, RULE, where, message, `pass collectionsUi (the default export of shared/collections-ui) to ${callee}()`, docsAnchor("preset-schemas-collections-ui")));
        continue;
      }
      const all = edits.filter((edit): edit is Edit => edit !== undefined);
      if (needsImport && importAt !== undefined) {
        all.push({ file, start: importAt, end: importAt, text: `\n${IMPORT}` });
        needsImport = false;
      }
      findings.push(autoFinding(id, RULE, where, message, `passes collectionsUi from shared/collections-ui to ${callee}()`, all, docsAnchor("preset-schemas-collections-ui")));
    }
    return findings;
  },
};
