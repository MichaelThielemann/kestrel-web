import { fileURLToPath } from "node:url";
import { addTemplate, defineNuxtModule } from "@nuxt/kit";
import { boundaryCast } from "#kestrel/cast";
import { packageInstalled } from "#kestrel-core/modules/optional-modules/installed";

const VIRTUAL_ID = "#kestrel-insights-canvas";
const CANVAS = fileURLToPath(new URL("../../app/components/InsightsGraphCanvas.vue", import.meta.url));
const UNAVAILABLE = fileURLToPath(new URL("../../app/components/InsightsGraphUnavailable.vue", import.meta.url));
const LAYER_DIR = fileURLToPath(new URL("../..", import.meta.url));
const GRAPH_PACKAGES = ["@vue-flow/core", "@dagrejs/dagre"] as const;
const CANVAS_TYPES = "kestrel/insights-graph-canvas.d.ts";
const CANVAS_DECLARATION = `declare module "${VIRTUAL_ID}" {
  import type { Component } from "vue";
  const component: Component;
  export default component;
}
`;
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
  resolve?: { alias?: Record<string, string> | readonly { find: string | RegExp; replacement: string }[] };
  optimizeDeps?: { include?: string[] };
};

export default defineNuxtModule({
  meta: { name: "kestrel-insights-graph" },
  setup(_options, nuxt) {
    const from = [nuxt.options.rootDir, LAYER_DIR];
    const available = GRAPH_PACKAGES.every((name) => packageInstalled(name, from));
    const dst = available ? CANVAS : UNAVAILABLE;

    nuxt.options.alias[VIRTUAL_ID] = dst;

    const canvasTypes = addTemplate({ filename: CANVAS_TYPES, write: true, getContents: () => CANVAS_DECLARATION });
    nuxt.hook("prepare:types", ({ references }) => {
      references.push({ path: canvasTypes.dst });
    });

    if (!available) {
      const stubs = addTemplate({ filename: STUB_TYPES, write: true, getContents: () => STUB_DECLARATIONS });
      nuxt.hook("prepare:types", ({ references }) => {
        references.push({ path: stubs.dst });
      });
    }

    nuxt.hook("vite:extendConfig", (config: ViteConfig) => {
      config.resolve ??= {};
      const existing = config.resolve.alias ?? {};
      config.resolve.alias = Array.isArray(existing)
        ? [{ find: VIRTUAL_ID, replacement: dst }, ...boundaryCast<readonly { find: string | RegExp; replacement: string }[]>(existing, "host")]
        : { [VIRTUAL_ID]: dst, ...existing };
      const prebundle = GRAPH_PACKAGES.filter((name) => packageInstalled(name, [nuxt.options.rootDir]));
      if (!available || prebundle.length === 0) return;
      config.optimizeDeps ??= {};
      config.optimizeDeps.include = [...(config.optimizeDeps.include ?? []), ...prebundle];
    });
  },
});
