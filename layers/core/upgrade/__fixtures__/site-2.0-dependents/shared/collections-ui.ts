import { defineCollectionsUi, presetCollectionsUi } from "#kestrel/collections-ui";
import { contentTypes, features } from "./model";

export default defineCollectionsUi({
  ...presetCollectionsUi({ features, collections: contentTypes }),
  pages: {
    label: { singular: "Page", plural: "Pages", new: "New page" },
    icon: "file-text",
    editor: "blocks",
    fieldLayout: [
      { kind: "row", fields: ["title"], tracks: [1] },
      { kind: "row", fields: ["slug", "status"], tracks: [2, 1] },
    ],
    seoFields: ["shareImage"],
    fieldLabels: {
      title: "Title",
      slug: "Slug",
      status: "Status",
      shareImage: "Share image",
      body: "Content",
      seo: "SEO",
    },
    editorOwned: ["body", "seo"],
    fieldOverrides: {
      slug: { required: false, options: { from: "title" } },
      status: {
        options: {
          choices: [
            { value: "draft", label: "Draft" },
            { value: "finished", label: "Finished" },
            { value: "published", label: "Published" },
          ],
          display: "select",
        },
      },
      shareImage: { options: { accept: "image" } },
    },
  },
}, contentTypes);
