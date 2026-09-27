import { defineCollectionsUi } from "#kestrel/collections-ui";

export default defineCollectionsUi({
  news: { label: { singular: "News", plural: "News" }, fieldOverrides: { cta: { type: "link" } } },
});
