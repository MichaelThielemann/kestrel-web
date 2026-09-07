export interface SyntheticContentField {
  type: string;
  required?: boolean;
  unique?: boolean;
  localized?: boolean;
  options?: string[];
}

export interface SyntheticContentType {
  kind: "single" | "multi";
  fields: Record<string, SyntheticContentField>;
}

export const syntheticContentTypes = {
  settings: {
    kind: "single",
    fields: {
      title: { type: "text", required: true, localized: true },
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
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
    },
  },
  news: {
    kind: "multi",
    fields: {
      title: { type: "text", required: true, localized: true },
      body: { type: "json", localized: true },
      status: { type: "enum", options: ["draft", "finished", "published"], required: true, localized: true },
    },
  },
  profile: {
    kind: "single",
    fields: {
      bio: { type: "text", localized: true },
    },
  },
  notifications: {
    kind: "single",
    fields: {
      emailDigest: { type: "boolean" },
    },
  },
} satisfies Record<string, SyntheticContentType>;

export type SyntheticContentTypeName = keyof typeof syntheticContentTypes;
