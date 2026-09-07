import type { Localized, LayoutNode, SerializedField } from "../app/types/kestrel";
import type { CollectionModel, Feature } from "#kestrel/pipelines";

const NAVIGATION_TARGET_CHOICES = {
  choices: [
    { value: "_self", label: { en: "Same window", de: "Gleiches Fenster" } },
    { value: "_blank", label: { en: "New window", de: "Neues Fenster" } },
  ],
  display: "select" as const,
};

const NAVIGATION_LINK_OPTIONS = { types: ["internal", "external"] as const };

const NAVIGATION_ENTRY_ROW = { kind: "row" as const, fields: ["label", "link", "target"], tracks: [2, 4, 1] };

export type SerializedFieldOverride = Omit<Partial<SerializedField>, "relation"> & {
  relation?: Partial<NonNullable<SerializedField["relation"]>>;
};

export type CollectionPlacement = "rail" | "system" | "account";

const PLACEMENTS: readonly CollectionPlacement[] = ["rail", "system", "account"];

export interface CollectionUi {
  label: { singular: Localized; plural: Localized; new?: Localized };
  icon?: string;
  editor?: "fields" | "blocks";
  fieldLayout?: LayoutNode[];
  seoFields?: string[];
  fieldLabels?: Record<string, Localized>;
  editorOwned?: string[];
  fieldOverrides?: Record<string, SerializedFieldOverride>;
  placement?: CollectionPlacement;
  nav?: boolean;
}

export type BlockTagLabels = Record<string, Localized>;

export function defineBlockTags(map: BlockTagLabels): BlockTagLabels {
  for (const [tag, label] of Object.entries(map)) {
    if (typeof label !== "string" && (typeof label !== "object" || label === null || Array.isArray(label))) {
      throw new Error(`collections-ui: blockTags["${tag}"] must be a string or a { locale: string } map`);
    }
  }
  return map;
}

export function defineCollectionsUi(map: Record<string, CollectionUi>, collections?: Record<string, CollectionModel>): Record<string, CollectionUi> {
  for (const [name, ui] of Object.entries(map)) {
    if (!ui.label?.singular || !ui.label?.plural) {
      throw new Error(`collections-ui: "${name}" is missing label.singular or label.plural`);
    }
    if (ui.placement !== undefined && !PLACEMENTS.includes(ui.placement)) {
      throw new Error(`collections-ui: "${name}" has invalid placement "${ui.placement}"`);
    }
    const kind = collections?.[name]?.kind;
    if (kind === "multi" && (ui.placement === "system" || ui.placement === "account")) {
      throw new Error(`collections-ui: "${name}" is kind "multi" and cannot use placement "${ui.placement}" (must be "rail")`);
    }
  }
  return map;
}

function navigationEntryFields(withChildren: boolean): Record<string, SerializedFieldOverride> {
  const fields: Record<string, SerializedFieldOverride> = {
    label: { type: "text", required: true, label: { en: "Label", de: "Label" } },
    link: { type: "link", required: true, label: { en: "Link", de: "Link" }, options: NAVIGATION_LINK_OPTIONS },
    target: { type: "choice", default: "_self", label: { en: "Target", de: "Ziel" }, options: NAVIGATION_TARGET_CHOICES },
  };
  if (withChildren) {
    fields.children = {
      type: "repeater",
      default: [],
      label: { en: "Sub items", de: "Untereinträge" },
      options: {
        fields: navigationEntryFields(false),
        fieldLayout: [NAVIGATION_ENTRY_ROW],
      },
    };
  }
  return fields;
}

const TITLE_ROW_FIELDS = ["titlePosition", "titleSeparator", "title"];

export function presetCollectionsUi({
  features,
  collections,
}: {
  features: readonly Feature[];
  collections?: Record<string, { fields: Record<string, unknown> }>;
}): Record<string, CollectionUi> {
  const settingsFields = collections?.settings?.fields ?? {};
  const titleRow = TITLE_ROW_FIELDS.filter((name) => name in settingsFields);
  const settingsLayout: LayoutNode[] | undefined = collections
    ? [
        ...(titleRow.length ? [{ kind: "row" as const, fields: titleRow, tracks: titleRow.map((name) => (name === "title" ? 2 : 1)) }] : []),
        ...Object.keys(settingsFields).filter((name) => !titleRow.includes(name)).map((name) => ({ kind: "row" as const, fields: [name], tracks: [1] })),
      ]
    : undefined;
  const ui: Record<string, CollectionUi> = {
    settings: {
      label: { singular: { en: "Settings", de: "Einstellungen" }, plural: { en: "Settings", de: "Einstellungen" } },
      icon: "settings",
      placement: "system",
      ...(settingsLayout ? { fieldLayout: settingsLayout } : {}),
      fieldLabels: {
        title: { en: "Site title", de: "Website-Titel" },
        ...("description" in settingsFields ? { description: { en: "Site description", de: "Website-Beschreibung" } } : {}),
        navigation: { en: "Navigation", de: "Navigation" },
        ...("titleSeparator" in settingsFields ? { titleSeparator: { en: "Separator", de: "Trenner" } } : {}),
        ...("titlePosition" in settingsFields ? { titlePosition: { en: "Site title position", de: "Position des Website-Titels" } } : {}),
      },
      fieldOverrides: {
        ...("titlePosition" in settingsFields
          ? {
              titlePosition: {
                options: {
                  display: "select",
                  choices: [
                    { value: "suffix", label: { en: "After the page title", de: "Nach dem Seitentitel" } },
                    { value: "prefix", label: { en: "Before the page title", de: "Vor dem Seitentitel" } },
                  ],
                },
              },
            }
          : {}),
        navigation: {
          type: "repeater",
          options: {
            fields: navigationEntryFields(true),
            fieldLayout: [NAVIGATION_ENTRY_ROW, { kind: "row", fields: ["children"], tracks: [1] }],
          },
        },
      },
    },
  };

  if (features.includes("redirects")) {
    ui.redirects = {
      label: { singular: { en: "Redirects", de: "Weiterleitungen" }, plural: { en: "Redirects", de: "Weiterleitungen" } },
      icon: "link-2",
      placement: "system",
      fieldLabels: {
        rules: { en: "Rules", de: "Regeln" },
      },
      fieldOverrides: {
        rules: {
          type: "repeater",
          options: {
            fields: {
              from: { type: "text", required: true, label: { en: "From", de: "Von" } },
              to: { type: "text", required: true, label: { en: "To", de: "Nach" } },
              status: {
                type: "choice",
                required: true,
                default: "301",
                label: { en: "Status", de: "Status" },
                options: {
                  choices: [
                    { value: "301", label: "301" },
                    { value: "302", label: "302" },
                    { value: "307", label: "307" },
                    { value: "308", label: "308" },
                  ],
                  display: "select",
                },
              },
            },
            fieldLayout: [{ kind: "row", fields: ["from", "to", "status"], tracks: [2, 2, 1] }],
          },
        },
      },
    };
  }

  return ui;
}
