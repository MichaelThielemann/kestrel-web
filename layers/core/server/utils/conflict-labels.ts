import type { Kestrel } from "@michaelthielemann/kestrel";
import { getRequestHeaders, getRequestURL, getResponseStatus, type EventHandler, type H3Event } from "h3";
import { collectionNames } from "../../pipelines/collections";

const CONFLICT_STATUS = 409;
const PREVIEW_SUFFIX = "/path-preview";
const ACCESS_PIPELINE = "adminSchemaModel";

interface Conflict {
  path: string;
  locale: string;
  type: string;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function conflictsOf(body: unknown): Conflict[] {
  const details = isRecord(body) ? body.details : undefined;
  const conflicts = isRecord(details) && Array.isArray(details.conflicts) ? details.conflicts : [];
  return conflicts.filter((entry): entry is Conflict => isRecord(entry) && typeof entry.path === "string" && typeof entry.locale === "string" && typeof entry.type === "string" && typeof entry.label === "string");
}

/**
 * The pipeline whose access decides whether a caller may see the title of a document of `type`: the
 * collection's admin read (`<type>.manage`), which also returns drafts, since the holder of a path is often a
 * draft that the public read (`<type>.read`, anonymous callers included) would never show.
 */
export function readPipelineOf(type: string): string {
  return `readAny${collectionNames(type).singular}`;
}

/**
 * A path conflict's answer without the title of each document holding a path whose collection the caller
 * cannot read: the conflict's `label` is emptied and "is taken by <type> "<label>"" becomes "is taken" in the
 * error text and in every field error. `undefined` when the answer names no such document.
 */
export function withoutHiddenLabels(body: unknown, readable: (type: string) => boolean): unknown {
  if (!isRecord(body)) return undefined;
  const hidden = conflictsOf(body).filter((conflict) => conflict.label !== "" && !readable(conflict.type));
  if (hidden.length === 0) return undefined;
  const scrub = (text: unknown): unknown => (typeof text === "string" ? hidden.reduce((out, conflict) => out.split(` is taken by ${conflict.type} "${conflict.label}"`).join(" is taken"), text) : text);
  const details = isRecord(body.details) ? body.details : {};
  const fields = Array.isArray(details.fields) ? details.fields.map((field: unknown) => (isRecord(field) ? { ...field, message: scrub(field.message) } : field)) : details.fields;
  const conflicts = Array.isArray(details.conflicts) ? details.conflicts.map((entry: unknown) => (isRecord(entry) && hidden.some((conflict) => conflict.type === entry.type && conflict.path === entry.path) ? { ...entry, label: "" } : entry)) : details.conflicts;
  return { ...body, error: scrub(body.error), details: { ...details, fields, conflicts } };
}

function namedDocument(value: unknown): value is { type: string; label: string } {
  return isRecord(value) && typeof value.type === "string" && typeof value.label === "string";
}

/** A path preview without the title of each document it names whose collection the caller cannot read; `undefined` when it names none. */
export function withoutHiddenPreviewLabels(body: unknown, readable: (type: string) => boolean): unknown {
  if (!isRecord(body)) return undefined;
  const hide = (value: unknown): unknown => (namedDocument(value) && value.label !== "" && !readable(value.type) ? { ...value, label: "" } : value);
  const conflict = body.conflict;
  const hiddenReason = namedDocument(conflict) && conflict.label !== "" && !readable(conflict.type) && typeof body.reason === "string" ? body.reason.split(` by ${conflict.type} "${conflict.label}"`).join("") : body.reason;
  const next = {
    ...body,
    reason: hiddenReason,
    conflict: hide(body.conflict),
    exposesParentSlug: hide(body.exposesParentSlug),
    ...(Array.isArray(body.shadows) ? { shadows: body.shadows.map(hide) } : {}),
  };
  return JSON.stringify(next) === JSON.stringify(body) ? undefined : next;
}

async function readableTypes(kestrel: Kestrel, event: H3Event): Promise<(type: string) => boolean> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(getRequestHeaders(event))) if (typeof value === "string") headers[key.toLowerCase()] = value;
  const run = await kestrel.run(ACCESS_PIPELINE, { trigger: { kind: "http", name: "conflict labels" }, headers });
  const result: unknown = run.result;
  const access = isRecord(result) && isRecord(result.pipelineAccess) ? result.pipelineAccess : {};
  return (type) => access[readPipelineOf(type)] === "granted";
}

/** Wraps the API handler so a path conflict or a path preview never names a document whose collection the caller cannot manage. */
export function redactingConflictLabels(kestrel: Kestrel, inner: EventHandler): EventHandler {
  return async (event) => {
    const answer: unknown = await inner(event);
    if (getResponseStatus(event) === 200 && typeof answer === "string" && getRequestURL(event).pathname.endsWith(PREVIEW_SUFFIX) && answer.includes('"label"')) {
      let preview: unknown;
      try {
        preview = JSON.parse(answer);
      } catch {
        return answer;
      }
      const redacted = withoutHiddenPreviewLabels(preview, await readableTypes(kestrel, event));
      return redacted === undefined ? answer : JSON.stringify(redacted);
    }
    if (getResponseStatus(event) !== CONFLICT_STATUS || typeof answer !== "string" || !answer.includes('"conflicts"')) return answer;
    let body: unknown;
    try {
      body = JSON.parse(answer);
    } catch {
      return answer;
    }
    if (conflictsOf(body).length === 0) return answer;
    const redacted = withoutHiddenLabels(body, await readableTypes(kestrel, event));
    return redacted === undefined ? answer : JSON.stringify(redacted);
  };
}
