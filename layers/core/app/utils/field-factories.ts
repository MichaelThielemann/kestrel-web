import type { PropType } from "vue";
import type { Condition, LayoutNode, LinkType, LinkValue, Localized, SerializedField } from "../types/kestrel";

export const KESTREL_FIELD = Symbol.for("kestrel.field");

export interface FieldProp<T> {
  type: PropType<T>;
  required: boolean;
  default?: T | (() => T) | null;
  [KESTREL_FIELD]: SerializedField;
}

export interface BaseFieldOptions {
  required?: boolean;
  unique?: boolean;
  label?: Localized;
  default?: unknown;
  condition?: Condition;
}

type AnyFieldOptions = BaseFieldOptions & Record<string, unknown>;

const BASE_KEYS = new Set(["required", "unique", "label", "default", "condition"]);

function serialize(type: string, opts: BaseFieldOptions, extra?: Partial<SerializedField>): SerializedField {
  const field: SerializedField = { type, required: !!opts.required, unique: !!opts.unique, ...extra };
  if (opts.label !== undefined) field.label = opts.label;
  if (opts.default !== undefined) field.default = opts.default;
  if (opts.condition !== undefined) field.condition = opts.condition;
  const options: Record<string, unknown> = { ...(extra?.options ?? {}) };
  for (const [key, value] of Object.entries(opts)) {
    if (BASE_KEYS.has(key)) continue;
    if (value !== undefined) options[key] = value;
  }
  if (Object.keys(options).length) field.options = options;
  return field;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function prop<T>(field: SerializedField, ctor: unknown): FieldProp<T> {
  const declaration: FieldProp<T> = { type: ctor as PropType<T>, required: field.required, [KESTREL_FIELD]: field };
  if ("default" in field) {
    const value = field.default;
    declaration.default = (value !== null && typeof value === "object" ? () => clone(value) : value) as FieldProp<T>["default"];
  }
  return declaration;
}

const ANY = [Object, Array, String, Number, Boolean];

export interface TextFieldOptions extends BaseFieldOptions {
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
}
export const textField = (opts: TextFieldOptions = {}): FieldProp<string | null> => prop(serialize("text", opts), String);

export const richtextField = (opts: BaseFieldOptions = {}): FieldProp<string | null> => prop(serialize("richtext", opts), String);

export interface SlugFieldOptions extends BaseFieldOptions {
  from?: string;
  prefix?: string;
}
export const slugField = (opts: SlugFieldOptions = {}): FieldProp<string | null> => prop(serialize("slug", opts), String);

export interface NumberFieldOptions extends BaseFieldOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  decimals?: number;
  unit?: string;
  units?: string[];
}
export const numberField = (opts: NumberFieldOptions = {}): FieldProp<number | null> => prop(serialize("number", opts), Number);

export const booleanField = (opts: BaseFieldOptions = {}): FieldProp<boolean | null> => prop(serialize("boolean", opts), Boolean);

export interface DatetimeFieldOptions extends BaseFieldOptions {
  precision?: "date" | "datetime" | "time";
}
export const datetimeField = (opts: DatetimeFieldOptions = {}): FieldProp<number | null> => prop(serialize("datetime", opts), Number);

export interface ChoiceFieldOptions extends BaseFieldOptions {
  choices: { value: string; label?: Localized }[];
  display?: "select" | "buttons" | "checkboxes";
}
export function choiceField(opts: ChoiceFieldOptions & { multiple: true }): FieldProp<string[] | null>;
export function choiceField(opts: ChoiceFieldOptions & { multiple?: false }): FieldProp<string | null>;
export function choiceField(opts: ChoiceFieldOptions & { multiple?: boolean }): FieldProp<string | string[] | null> {
  return prop(serialize("choice", opts), opts.multiple ? Array : String);
}

export interface LinkFieldOptions extends BaseFieldOptions {
  types?: LinkType[];
  collections?: string[];
}
export const linkField = (opts: LinkFieldOptions = {}): FieldProp<LinkValue | null> => prop(serialize("link", opts), Object);

export interface MediaFieldOptions extends BaseFieldOptions {
  accept?: "image" | "any";
}
export function mediaField(opts: MediaFieldOptions & { multiple: true }): FieldProp<string[] | null>;
export function mediaField(opts?: MediaFieldOptions & { multiple?: false }): FieldProp<string | null>;
export function mediaField(opts: MediaFieldOptions & { multiple?: boolean } = {}): FieldProp<string | string[] | null> {
  return prop(serialize("media", opts, { single: !opts.multiple }), opts.multiple ? Array : String);
}

export interface RelationFieldOptions extends BaseFieldOptions {
  collection: string;
  labelField?: string;
}
export function relationField(opts: RelationFieldOptions & { many: true }): FieldProp<string[] | null>;
export function relationField(opts: RelationFieldOptions & { many?: false }): FieldProp<string | null>;
export function relationField(opts: RelationFieldOptions & { many?: boolean }): FieldProp<string | string[] | null> {
  const { collection, many, labelField, ...rest } = opts;
  if (typeof collection !== "string" || !collection) throw new Error("relationField requires a `collection` (the target collection name)");
  const relation: SerializedField["relation"] = { collection, many: !!many };
  if (labelField) relation.labelField = labelField;
  return prop(serialize("relation", rest, { single: !many, relation }), many ? Array : String);
}

export const jsonField = (opts: BaseFieldOptions = {}): FieldProp<unknown> => prop(serialize("json", opts), ANY);

export interface RepeaterFieldOptions extends BaseFieldOptions {
  fields: Record<string, FieldProp<unknown> | SerializedField>;
  fieldLayout?: LayoutNode[];
  min?: number;
  max?: number;
}
export function repeaterField(opts: RepeaterFieldOptions): FieldProp<Record<string, unknown>[] | null> {
  const { fields, ...rest } = opts;
  return prop(serialize("repeater", rest, { options: { fields: unwrapFields(fields) } }), Array);
}

function unwrapFields(fields: Record<string, unknown>): Record<string, SerializedField> {
  const out: Record<string, SerializedField> = {};
  for (const [name, value] of Object.entries(fields)) {
    out[name] = value && typeof value === "object" && KESTREL_FIELD in value ? (value as FieldProp<unknown>)[KESTREL_FIELD] : (value as SerializedField);
  }
  return out;
}

export function field(type: string, opts: AnyFieldOptions = {}): FieldProp<unknown> {
  return prop(serialize(type, opts), ANY);
}
