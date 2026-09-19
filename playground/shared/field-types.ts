import { defineFieldTypes } from "#kestrel/collections-ui";

export default defineFieldTypes({
  color: {
    storage: "text",
    schema: { type: "string", pattern: "^#[0-9a-f]{6}$" },
    empty: "#2266cc",
  },
});
