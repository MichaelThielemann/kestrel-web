import type { Feature } from "#kestrel/pipelines";

export const locales = ["de", "en"] as const;
export const defaultLocale = "de";

export const prefixPrimary = false;

export type UntranslatedPagesPolicy = "notFound" | "redirect";

export const untranslatedPages: UntranslatedPagesPolicy = "redirect";
export const previewBanner = true;

export const homeSlug = "home";

export type NavigationLinkType = "internal" | "external" | "email" | "tel";

export interface NavigationLink {
  type: NavigationLinkType;
  path?: string;
  broken?: boolean;
  url?: string;
  email?: string;
  tel?: string;
  hash?: string;
  label?: string;
}

export interface NavigationItem {
  label: string;
  link: NavigationLink;
  target?: "_self" | "_blank";
  children?: NavigationItem[];
}

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
      titlePosition: { type: "enum", options: ["suffix", "prefix"] },
      titleSeparator: { type: "text" },
      description: { type: "text", localized: true },
      navigation: { type: "json", localized: true },
    },
  },
  redirects: {
    kind: "single",
    fields: {
      rules: { type: "json" },
    },
  },
  pages: {
    kind: "multi",
    fields: {
      slug: { type: "slug", required: true, unique: true, localized: true },
      title: { type: "text", required: true, localized: true },
      body: { type: "json", localized: true },
      seo: { type: "json", localized: true },
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
      shareImage: { type: "ref", to: "media" },
      layout: { type: "text" },
    },
  },
} satisfies Record<string, ContentType>;

export type ContentTypeName = keyof typeof contentTypes;

export const contentModel = { locales: [...locales], defaultLocale, types: contentTypes };

export const features = ["references", "links", "delivery", "redirects", "images", "replication", "ratelimit", "audit", "sanitizeSvg"] as const satisfies readonly Feature[];
