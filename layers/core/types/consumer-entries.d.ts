declare module "#kestrel/consumer-pipelines" {
  export const pipelines: readonly import("@michaelthielemann/kestrel/definePipeline").PipelineDefinition[];
}

declare module "#kestrel/consumer-modules" {
  const modules: import("@michaelthielemann/kestrel/defineModule").ModuleDefinition[];
  export default modules;
}
