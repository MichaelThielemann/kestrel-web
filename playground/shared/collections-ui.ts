import { defineCollectionsUi, presetCollectionsUi } from "#kestrel/collections-ui";
import { contentTypes, features } from "./model";

const BLOCKS_FIELD = "body";
const BLOCK_ALIASES_FIELD = "blockAliases";
const SEO_FIELD = "seo";

export default defineCollectionsUi({
  ...presetCollectionsUi({ features, collections: contentTypes }),
  pages: {
    label: { singular: { en: "Page", de: "Seite" }, plural: { en: "Pages", de: "Seiten" }, new: { en: "New page", de: "Neue Seite" } },
    icon: "file-text",
    editor: "blocks",
    fieldLayout: [
      { kind: "row", fields: ["title"], tracks: [1] },
      { kind: "row", fields: ["parent"], tracks: [1] },
      { kind: "row", fields: ["slug", "status"], tracks: [2, 1] },
      { kind: "row", fields: ["accent"], tracks: [1] },
    ],
    seoFields: ["shareImage"],
    fieldLabels: {
      title: { en: "Title", de: "Titel" },
      parent: { en: "Parent page", de: "Übergeordnete Seite" },
      slug: "Slug",
      status: "Status",
      shareImage: { en: "Share image", de: "Share-Bild" },
      accent: { en: "Accent colour", de: "Akzentfarbe" },
      body: { en: "Content", de: "Inhalt" },
      blockAliases: { en: "Block aliases", de: "Block-Aliasnamen" },
      seo: "SEO",
    },
    editorOwned: [BLOCKS_FIELD, BLOCK_ALIASES_FIELD, SEO_FIELD],
    fieldOverrides: {
      slug: { required: false, options: { from: "title" } },
      status: {
        options: {
          choices: [
            { value: "draft", label: { en: "Draft", de: "Entwurf" } },
            { value: "finished", label: { en: "Finished", de: "Fertig" } },
            { value: "published", label: { en: "Published", de: "Veröffentlicht" } },
          ],
          display: "select",
        },
      },
      shareImage: { options: { accept: "image" } },
    },
  },
  blog: {
    label: { singular: { en: "Post", de: "Beitrag" }, plural: { en: "Blog", de: "Blog" }, new: { en: "New post", de: "Neuer Beitrag" } },
    icon: "file-text",
    editor: "blocks",
    fieldLayout: [
      { kind: "row", fields: ["title"], tracks: [1] },
      { kind: "row", fields: ["slug", "status"], tracks: [2, 1] },
    ],
    fieldLabels: { title: { en: "Title", de: "Titel" }, slug: "Slug", status: "Status", body: { en: "Content", de: "Inhalt" }, blockAliases: { en: "Block aliases", de: "Block-Aliasnamen" }, seo: "SEO" },
    editorOwned: ["body", BLOCK_ALIASES_FIELD, "seo"],
    fieldOverrides: {
      slug: { required: false, options: { from: "title" } },
      status: {
        options: {
          choices: [
            { value: "draft", label: { en: "Draft", de: "Entwurf" } },
            { value: "finished", label: { en: "Finished", de: "Fertig" } },
            { value: "published", label: { en: "Published", de: "Veröffentlicht" } },
          ],
          display: "select",
        },
      },
    },
  },
}, contentTypes);
