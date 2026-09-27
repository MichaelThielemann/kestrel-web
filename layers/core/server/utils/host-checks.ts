import type { BootProblem, Manifest } from "@michaelthielemann/kestrel";
import type { HostProblem } from "@michaelthielemann/kestrel-upgrade/plugin";
import type { WorkflowUi } from "../../collections-ui/workflow";
import { adminBootstrapProblem } from "./admin-bootstrap";
import { fieldGrantHint } from "./field-grant-hint";
import { projectMediaPathProblems } from "./media-paths";
import type { ConfigEntry, ModuleLike } from "./modules";
import { siteModelProblem, type SiteModel } from "./site-model";
import { projectStatusFilterFailure, type PipelineShape } from "./status-filter";
import { projectLinkCheckFailure } from "./link-checks";

const OWNER = "kestrel-web";

export interface LayerHostCheckInput {
  configModules: readonly ConfigEntry[];
  modules: readonly ModuleLike[];
  pipelines: readonly PipelineShape[];
  siteModel?: SiteModel;
  collectionsUi: Record<string, WorkflowUi>;
  presetProblems: readonly { code: string; pipeline?: string; message: string }[];
  bootErrors: readonly BootProblem[];
  /** The checked engine's manifest; absent when the boot check stopped before it resolved the modules. */
  manifest?: Manifest;
  /** Whether every module and pipeline was checked, so the manifest lists every step and pipeline. */
  complete: boolean;
}

function error(code: string, reason: string, extra: Partial<HostProblem> = {}): HostProblem {
  return { code, severity: "error", owner: OWNER, reason, ...extra };
}

function guarded(code: string, check: () => HostProblem[]): HostProblem[] {
  try {
    return check();
  } catch (err) {
    return [error(code, err instanceof Error ? err.message : String(err))];
  }
}

/**
 * What the layer's server checks at boot beyond kestrel's own `boot()`, computed from a boot check instead
 * of a running server: the preset's composition problems, `shared/model` against `site-default`, the admin
 * bootstrap routes, the public status filters, the media paths, and the fix for an uncut field grant.
 */
export function layerHostProblems(input: LayerHostCheckInput): HostProblem[] {
  const problems: HostProblem[] = input.presetProblems.map((problem) => error(problem.code, problem.message, problem.pipeline === undefined ? {} : { pipeline: problem.pipeline }));

  if (input.siteModel !== undefined) {
    const site = siteModelProblem(input.configModules, input.siteModel);
    if (site !== undefined) problems.push(error("site-model", site, { module: "@michaelthielemann/kestrel-site-default" }));
  }

  const manifest = input.manifest;
  if (manifest !== undefined) {
    const admin = adminBootstrapProblem(manifest.triggers.http);
    if (admin !== undefined) problems.push(error("admin-bootstrap", admin));

    const owner = (step: string): string | undefined => manifest.steps.find((entry) => entry.name === step)?.module;
    problems.push(
      ...guarded("status-filter", () => {
        const failure = projectStatusFilterFailure(input.modules, input.configModules, owner("content.list"), input.collectionsUi, input.pipelines);
        const links = projectLinkCheckFailure(input.modules, input.configModules, owner("content.list"), input.collectionsUi, input.pipelines);
        return [...(failure === undefined ? [] : [error("status-filter", failure)]), ...(links === undefined ? [] : [error("link-check", links)])];
      }),
    );
    if (input.complete) {
      problems.push(...guarded("media-paths", () => projectMediaPathProblems(manifest, owner, input.modules, input.configModules).map((reason) => error("media-paths", reason))));
    }
  }

  for (const bootError of input.bootErrors) {
    const hint = fieldGrantHint(bootError.owner, bootError.reason);
    if (hint !== undefined) problems.push({ code: "field-grant-hint", severity: "warning", owner: OWNER, module: bootError.owner, reason: hint });
  }
  return problems;
}
