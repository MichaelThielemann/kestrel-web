import { defineCollectionsUi, presetCollectionsUi } from "#kestrel/collections-ui";
import { contentTypes, features } from "./model";

const BLOCKS_FIELD = "body";
const SEO_FIELD = "seo";

export default defineCollectionsUi({
  ...presetCollectionsUi({ features, collections: contentTypes }),
  pages: {
    label: { singular: { en: "Page", de: "Seite" }, plural: { en: "Pages", de: "Seiten" }, new: { en: "New page", de: "Neue Seite" } },
    icon: "file-text",
    editor: "blocks",
    fieldLayout: [
      { kind: "row", fields: ["title"], tracks: [1] },
      { kind: "row", fields: ["slug", "status"], tracks: [2, 1] },
    ],
    seoFields: ["shareImage"],
    fieldLabels: {
      title: { en: "Title", de: "Titel" },
      slug: "Slug",
      status: "Status",
      shareImage: { en: "Share image", de: "Share-Bild" },
      body: { en: "Content", de: "Inhalt" },
      seo: "SEO",
    },
    editorOwned: [BLOCKS_FIELD, SEO_FIELD],
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
}, contentTypes);
