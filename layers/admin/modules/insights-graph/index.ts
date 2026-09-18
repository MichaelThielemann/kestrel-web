import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule } from "@nuxt/kit";
import { packageInstalled } from "#kestrel-core/modules/optional-modules/installed";

const VIRTUAL_ID = "#kestrel-insights-canvas";
const CANVAS = fileURLToPath(new URL("../../app/components/InsightsGraphCanvas.vue", import.meta.url));
const UNAVAILABLE = fileURLToPath(new URL("../../app/components/InsightsGraphUnavailable.vue", import.meta.url));
const LAYER_DIR = fileURLToPath(new URL("../..", import.meta.url));
const GRAPH_PACKAGES = ["@vue-flow/core", "@dagrejs/dagre"] as const;
const STUB_TYPES = "kestrel/insights-graph-stubs.d.ts";
const STUB_DECLARATIONS = `declare module "@vue-flow/core" {
  export interface Node {
    id: string;
    type?: string;
    position: { x: number; y: number };
    data?: unknown;
    focusable?: boolean;
    sourcePosition?: string;
    targetPosition?: string;
  }
  export interface Edge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    animated?: boolean;
    class?: string;
    focusable?: boolean;
  }
  export const Position: { Left: string; Top: string; Right: string; Bottom: string };
  export const VueFlow: import("vue").DefineComponent<Record<string, unknown>>;
  export const Handle: import("vue").DefineComponent<Record<string, unknown>>;
  export function useVueFlow(): {
    fitView: (options?: unknown) => void;
    getSelectedNodes: import("vue").ComputedRef<Node[]>;
  };
}
declare module "@dagrejs/dagre" {
  interface DagreGraph {
    setDefaultEdgeLabel(fn: () => Record<string, unknown>): void;
    setGraph(config: Record<string, unknown>): void;
    setNode(id: string, value: Record<string, unknown>): void;
    hasNode(id: string): boolean;
    setEdge(source: string, target: string): void;
    node(id: string): { x: number; y: number } | undefined;
  }
  const dagre: {
    graphlib: { Graph: new () => DagreGraph };
    layout(graph: DagreGraph): void;
  };
  export default dagre;
}
`;

type ViteConfig = {
  resolve?: { alias?: Record<string, string> | { find: string | RegExp; replacement: string }[] };
  optimizeDeps?: { include?: string[] };
};

export default defineNuxtModule({
  meta: { name: "kestrel-insights-graph" },
  setup(_options, nuxt) {
    const from = [nuxt.options.rootDir, LAYER_DIR];
    const available = GRAPH_PACKAGES.every((name) => packageInstalled(name, from));
    const dst = available ? CANVAS : UNAVAILABLE;

    nuxt.options.alias[VIRTUAL_ID] = dst;

    if (!available) {
      const stubs = addTemplate({ filename: STUB_TYPES, write: true, getContents: () => STUB_DECLARATIONS });
      nuxt.hook("prepare:types", ({ references }) => {
        references.push({ path: stubs.dst });
      });
    }

    nuxt.hook("vite:extendConfig", (config) => {
      const vite = config as ViteConfig;
      vite.resolve ??= {};
      const existing = vite.resolve.alias ?? {};
      vite.resolve.alias = Array.isArray(existing) ? [{ find: VIRTUAL_ID, replacement: dst }, ...existing] : { [VIRTUAL_ID]: dst, ...existing };
      const prebundle = GRAPH_PACKAGES.filter((name) => packageInstalled(name, [nuxt.options.rootDir]));
      if (!available || prebundle.length === 0) return;
      vite.optimizeDeps ??= {};
      vite.optimizeDeps.include = [...(vite.optimizeDeps.include ?? []), ...prebundle];
    });
  },
});
