import type { Feature } from "#kestrel/pipelines";

export const locales = ["en"] as const;
export const defaultLocale = "en";

export const homeSlug = "home";

export type Locale = (typeof locales)[number];

export type ContentFieldType = "text" | "richtext" | "number" | "boolean" | "date" | "slug" | "json" | "enum" | "ref";

export interface ContentField {
  type: ContentFieldType;
  required?: boolean;
  unique?: boolean;
  localized?: boolean;
  options?: string[];
  to?: string;
}

export interface ContentType {
  kind: "single" | "multi";
  fields: Record<string, ContentField>;
}

export const contentTypes = {
  settings: {
    kind: "single",
    fields: {
      title: { type: "text", required: true, localized: true },
      description: { type: "text", localized: true },
      navigation: { type: "json", localized: true },
    },
  },
  redirects: { kind: "single", fields: { rules: { type: "json" } } },
  pages: {
    kind: "multi",
    fields: {
      slug: { type: "slug", required: true, unique: true, localized: true },
      title: { type: "text", required: true, localized: true },
      body: { type: "json", localized: true },
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
    },
  },
} satisfies Record<string, ContentType>;

export type ContentTypeName = keyof typeof contentTypes;

export const contentModel = { locales: [...locales], defaultLocale, types: contentTypes };

/** The one features list both presetModuleConfig() and definePreset() see: presetModuleConfig() supplies its own events-queue entry once "eventsQueue" is in here, replacing the hand-written events-direct entry's job. */
export const features = ["references", "links", "delivery", "redirects", "images"] as const satisfies readonly Feature[];
