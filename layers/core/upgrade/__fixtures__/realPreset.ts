import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import ts from "typescript";
import { kestrelAliases } from "../aliases";

/**
 * Imports a fixture's `kestrel.config.ts` through the layer's real `#kestrel/pipelines`, whose
 * `definePreset()` throws at the first problem as it does when the project builds and starts; the upgrade
 * loader composes through a collecting stand-in instead. Answers the thrown message, `undefined` when the
 * config composes.
 */
export async function realPresetError(dir: string): Promise<string | undefined> {
  const configFile = join(dir, "kestrel.config.ts");
  const aliases = { ...kestrelAliases(dir, join(dir, ".nuxt")), "~~/kestrel.config": configFile, "@@/kestrel.config": configFile, "~~/": `${dir}/`, "@@/": `${dir}/` };
  const jiti = createJiti(pathToFileURL(configFile).href, { alias: aliases, moduleCache: false, fsCache: false, interopDefault: true });
  const previousAppRoot = process.env.KESTREL_APP_ROOT;
  process.env.KESTREL_APP_ROOT = dir;
  try {
    await jiti.import(pathToFileURL(configFile).href);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    if (previousAppRoot === undefined) delete process.env.KESTREL_APP_ROOT;
    else process.env.KESTREL_APP_ROOT = previousAppRoot;
  }
}

/** TypeScript's syntax errors and duplicate-property errors (TS1117) for one file, checked on its own without resolving its imports. */
export function configCompileErrors(file: string): string[] {
  const program = ts.createProgram([file], { noEmit: true, noResolve: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, types: [] });
  const source = program.getSourceFile(file);
  if (source === undefined) return [`${file} could not be read`];
  const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source).filter((d) => d.code === 1117)];
  return diagnostics.map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}
