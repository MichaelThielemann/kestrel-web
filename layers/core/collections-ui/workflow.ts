import type { Workflow } from "../app/types/kestrel";

export interface WorkflowModel {
  fields: Record<string, unknown>;
}

export interface WorkflowUi {
  workflow?: Workflow;
}

const STATUS_FIELD = "status";
const DEFAULT_LIVE = "published";
const DEFAULT_DRAFT = "draft";
const DEFAULT_DONE = "finished";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function fieldType(model: WorkflowModel, field: string): string | undefined {
  const definition: unknown = model.fields[field];
  if (!isRecord(definition)) return undefined;
  const type = definition.type;
  return typeof type === "string" ? type : undefined;
}

export function fieldOptions(model: WorkflowModel, field: string): readonly string[] | undefined {
  const definition: unknown = model.fields[field];
  if (!isRecord(definition)) return undefined;
  const options = definition.options;
  return isStringArray(options) ? options : undefined;
}

export function resolveWorkflow(name: string, model: WorkflowModel, ui?: WorkflowUi): Workflow | undefined {
  if (ui?.workflow !== undefined) return ui.workflow;
  if (!(STATUS_FIELD in model.fields)) return undefined;
  const options = fieldOptions(model, STATUS_FIELD);
  if (options === undefined) return { field: STATUS_FIELD, live: DEFAULT_LIVE, draft: DEFAULT_DRAFT, done: DEFAULT_DONE };
  if (!options.includes(DEFAULT_DRAFT) || !options.includes(DEFAULT_LIVE)) return undefined;
  const base = { field: STATUS_FIELD, live: DEFAULT_LIVE, draft: DEFAULT_DRAFT };
  return options.includes(DEFAULT_DONE) ? { ...base, done: DEFAULT_DONE } : base;
}
