import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { isAstNode, objectProperty, parseTs, propertyKeyName, stringValue, walk } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";
import { MIGRATIONS_DIR_DEFAULT, listMigrationFiles } from "../modules/migrations/scan";

function configuredMigrationsDir(root: string): string {
  const path = join(root, "nuxt.config.ts");
  if (!existsSync(path)) return MIGRATIONS_DIR_DEFAULT;
  let dir: string | undefined;
  walk(parseTs(readFileSync(path, "utf8")), (node) => {
    if (node.type !== "ObjectProperty" || propertyKeyName(node) !== "migrationsDir") return;
    const value = isAstNode(node.value) ? stringValue(node.value) : undefined;
    if (value !== undefined) dir = value;
  });
  return dir ?? MIGRATIONS_DIR_DEFAULT;
}

function defaultExportObject(program: AstNode): AstNode | undefined {
  let found: AstNode | undefined;
  walk(program, (node) => {
    if (node.type !== "ExportDefaultDeclaration" || !isAstNode(node.declaration)) return;
    const declaration = node.declaration;
    if (declaration.type === "ObjectExpression") found = declaration;
    else if (declaration.type === "CallExpression" && Array.isArray(declaration.arguments) && isAstNode(declaration.arguments[0]) && declaration.arguments[0].type === "ObjectExpression") found = declaration.arguments[0];
  });
  return found;
}

function migrationId(file: string, root: string): string {
  const object = defaultExportObject(parseTs(readFileSync(file, "utf8")));
  const idNode = object === undefined ? undefined : objectProperty(object, "id");
  const id = idNode === undefined ? undefined : stringValue(idNode);
  if (id === undefined || id === "") throw new Error(`${relative(root, file)}: the id of the migration must be a string literal in the default export of ${basename(file)}`);
  return id;
}

/** The ids of the content migration files of the project at `root`, in file name order. */
export function contentMigrationIds(root: string): string[] {
  const dir = resolve(root, configuredMigrationsDir(root));
  return listMigrationFiles(dir).map((file) => migrationId(file, root));
}
