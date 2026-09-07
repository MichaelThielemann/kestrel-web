import { describe, expect, it } from "vitest";
import { blockSchema } from "../../block-schema";
import { blockNameFromFile, extractBlockDef } from "./extract-block";

const sfc = (script: string, template = "<template><div /></template>") => `<script setup lang="ts">\n${script}\n</script>\n\n${template}\n`;

describe("blockNameFromFile", () => {
  it("kebab-cases the file name", () => {
    expect(blockNameFromFile("Hero.vue")).toBe("hero");
    expect(blockNameFromFile("BoxedContainer.vue")).toBe("boxed-container");
    expect(blockNameFromFile("SEOHeader.vue")).toBe("seo-header");
    expect(blockNameFromFile("Columns2Up.vue")).toBe("columns2-up");
  });
});

describe("extractBlockDef", () => {
  it("reads field factories and block metadata", () => {
    const block = extractBlockDef(
      sfc(`const props = defineProps({
  heading: textField({ required: true, label: { en: 'Heading', de: 'Überschrift' } }),
  image: mediaField({ accept: 'image' }),
  cta: linkField(),
})
defineBlock({ label: 'Hero', slots: ['default'], icon: 'image' })`),
      "Hero.vue",
    );

    expect(block).toEqual({
      name: "hero",
      label: "Hero",
      slots: ["default"],
      icon: "image",
      fields: {
        heading: { type: "text", required: true, unique: false, label: { en: "Heading", de: "Überschrift" } },
        image: { type: "media", required: false, unique: false, single: true, options: { accept: "image" } },
        cta: { type: "link", required: false, unique: false },
      },
    });
  });

  it("defaults metadata away when defineBlock is absent", () => {
    const block = extractBlockDef(sfc("defineProps({ body: richtextField() })"), "Prose.vue");
    expect(block).toEqual({ name: "prose", fields: { body: { type: "richtext", required: false, unique: false } } });
  });

  it("keeps a JSON default on the field definition", () => {
    const block = extractBlockDef(sfc("defineProps({ ratio: choiceField({ default: '1-1', choices: [{ value: '1-1' }], display: 'buttons' }) })"), "Columns.vue");
    expect(block.fields.ratio).toEqual({
      type: "choice",
      required: false,
      unique: false,
      default: "1-1",
      options: { choices: [{ value: "1-1" }], display: "buttons" },
    });
  });

  it("unwraps nested repeater sub-fields", () => {
    const block = extractBlockDef(sfc("defineProps({ items: repeaterField({ fields: { title: textField({ required: true }), link: linkField() } }) })"), "List.vue");
    expect(block.fields.items).toEqual({
      type: "repeater",
      required: false,
      unique: false,
      options: {
        fields: {
          title: { type: "text", required: true, unique: false },
          link: { type: "link", required: false, unique: false },
        },
      },
    });
  });

  it("maps relation options onto the relation descriptor", () => {
    const block = extractBlockDef(sfc("defineProps({ page: relationField({ collection: 'pages', labelField: 'title' }) })"), "Teaser.vue");
    expect(block.fields.page).toEqual({
      type: "relation",
      required: false,
      unique: false,
      single: true,
      relation: { collection: "pages", many: false, labelField: "title" },
    });
  });

  it("looks inside withDefaults", () => {
    const block = extractBlockDef(sfc("const props = withDefaults(defineProps({ heading: textField() }), {})"), "Hero.vue");
    expect(Object.keys(block.fields)).toEqual(["heading"]);
  });

  it("ignores display-only props that carry no field definition", () => {
    const block = extractBlockDef(sfc("defineProps({ heading: textField(), media: Object })"), "Hero.vue");
    expect(Object.keys(block.fields)).toEqual(["heading"]);
  });

  it("rejects an SFC without <script setup>", () => {
    expect(() => extractBlockDef("<template><div /></template>", "Hero.vue")).toThrow(/<script setup>/);
  });

  it("rejects the type-only defineProps form", () => {
    expect(() => extractBlockDef(sfc("defineProps<{ heading?: string }>()"), "Hero.vue")).toThrow(/defineProps\(\{/);
  });

  it("rejects an uncalled field factory", () => {
    expect(() => extractBlockDef(sfc("defineProps({ heading: textField })"), "Hero.vue")).toThrow(/was not called/);
  });

  it("rejects a non-literal field argument", () => {
    expect(() => extractBlockDef(sfc("import { LABEL } from './labels'\ndefineProps({ heading: textField({ label: LABEL }) })"), "Hero.vue")).toThrow(/self-contained literals/);
  });

  it("rejects a function default", () => {
    expect(() => extractBlockDef(sfc("defineProps({ items: jsonField({ default: () => [] }) })"), "Hero.vue")).toThrow(/JSON-serializable/);
  });

  it("reports the file when <script setup> does not parse", () => {
    expect(() => extractBlockDef(sfc("const = )("), "Hero.vue")).toThrow(/Hero\.vue: could not parse/);
  });

  it("normalizes defineBlock's imageSizes onto the block", () => {
    const block = extractBlockDef(sfc("defineProps({ image: mediaField({ accept: 'image' }) })\ndefineBlock({ imageSizes: [{ name: 'content', width: 1200 }] })"), "Image.vue");
    expect(block.imageSizes).toEqual([{ name: "content", width: 1200, fit: "inside", format: "webp", quality: 82 }]);
  });

  it("omits imageSizes entirely when defineBlock declares none", () => {
    const block = extractBlockDef(sfc("defineProps({ heading: textField() })\ndefineBlock({ label: 'Hero' })"), "Hero.vue");
    expect(block).not.toHaveProperty("imageSizes");
  });

  it("does not change the page-body schema when a block declares imageSizes", () => {
    const withoutSizes = extractBlockDef(sfc("defineProps({ image: mediaField({ accept: 'image' }) })\ndefineBlock({ icon: 'image' })"), "Image.vue");
    const withSizes = extractBlockDef(sfc("defineProps({ image: mediaField({ accept: 'image' }) })\ndefineBlock({ icon: 'image', imageSizes: [{ name: 'content', width: 1200 }] })"), "Image.vue");
    expect(blockSchema([withSizes])).toEqual(blockSchema([withoutSizes]));
  });

  it("keeps an absolute picker image as a URL string", () => {
    const block = extractBlockDef(sfc("defineBlock({ image: '/icons/hero.png' })"), "Hero.vue");
    expect(block.image).toBe("/icons/hero.png");
    expect(block).not.toHaveProperty("imageFile");
  });

  it("keeps an http(s) picker image as a URL string", () => {
    const block = extractBlockDef(sfc("defineBlock({ image: 'https://cdn.example.com/hero.png' })"), "Hero.vue");
    expect(block.image).toBe("https://cdn.example.com/hero.png");
    expect(block).not.toHaveProperty("imageFile");
  });

  it("resolves a relative picker image against the SFC's directory", () => {
    const block = extractBlockDef(sfc("defineBlock({ image: './Hero.png' })"), "Hero.vue", "/root/app/blocks/Hero.vue");
    expect(block.imageFile).toBe("/root/app/blocks/Hero.png");
    expect(block).not.toHaveProperty("image");
  });

  it("resolves a parent-relative picker image against the SFC's directory", () => {
    const block = extractBlockDef(sfc("defineBlock({ image: '../images/hero.png' })"), "Hero.vue", "/root/app/blocks/Hero.vue");
    expect(block.imageFile).toBe("/root/app/images/hero.png");
  });

  it("looks in the configured images directory rather than next to the SFC", () => {
    const exists = (path: string) => path === "/root/images/Hero.webp";
    const block = extractBlockDef(sfc("defineProps({})"), "Hero.vue", "/root/app/blocks/Hero.vue", exists, "/root/images");
    expect(block.imageFile).toBe("/root/images/Hero.webp");
  });

  it("ignores a sibling image next to the SFC when an images directory is configured", () => {
    const exists = (path: string) => path === "/root/app/blocks/Hero.webp";
    const block = extractBlockDef(sfc("defineProps({})"), "Hero.vue", "/root/app/blocks/Hero.vue", exists, "/root/images");
    expect(block).not.toHaveProperty("imageFile");
  });

  it("keeps defineBlock's description", () => {
    const block = extractBlockDef(sfc("defineBlock({ label: 'Hero', description: { en: 'A big banner', de: 'Ein großes Banner' } })"), "Hero.vue");
    expect(block.description).toEqual({ en: "A big banner", de: "Ein großes Banner" });
  });

  it("omits description entirely when defineBlock declares none", () => {
    const block = extractBlockDef(sfc("defineBlock({ label: 'Hero' })"), "Hero.vue");
    expect(block).not.toHaveProperty("description");
  });

  it("extracts defineBlock's tags", () => {
    const block = extractBlockDef(sfc("defineBlock({ label: 'Hero', tags: ['hero', 'marketing-2'] })"), "Hero.vue");
    expect(block.tags).toEqual(["hero", "marketing-2"]);
  });

  it("omits tags entirely when defineBlock declares none", () => {
    const block = extractBlockDef(sfc("defineBlock({ label: 'Hero' })"), "Hero.vue");
    expect(block).not.toHaveProperty("tags");
  });

  it("omits tags entirely when defineBlock declares an empty array", () => {
    const block = extractBlockDef(sfc("defineBlock({ label: 'Hero', tags: [] })"), "Hero.vue");
    expect(block).not.toHaveProperty("tags");
  });

  it("rejects a non-array tags declaration naming the file", () => {
    expect(() => extractBlockDef(sfc("defineBlock({ tags: 'hero' })"), "Hero.vue")).toThrow(/Hero\.vue: defineBlock's "tags" must be a literal array of strings/);
  });

  it("rejects a tag with uppercase letters naming the file", () => {
    expect(() => extractBlockDef(sfc("defineBlock({ tags: ['Hero'] })"), "Hero.vue")).toThrow(/Hero\.vue: defineBlock tag "Hero" must match/);
  });

  it("rejects a tag with a leading or trailing hyphen", () => {
    expect(() => extractBlockDef(sfc("defineBlock({ tags: ['-hero'] })"), "Hero.vue")).toThrow(/must match \^\[a-z0-9\]/);
  });

  it("rejects a non-string tag entry naming the file", () => {
    expect(() => extractBlockDef(sfc("defineBlock({ tags: [42] })"), "Hero.vue")).toThrow(/Hero\.vue: defineBlock tag "42" must match/);
  });

  it("sets source to the passed-in relative path", () => {
    const block = extractBlockDef(sfc("defineProps({ heading: textField() })"), "Hero.vue", "/root/app/blocks/Hero.vue", undefined, undefined, "app/blocks/Hero.vue");
    expect(block.source).toBe("app/blocks/Hero.vue");
  });

  it("omits source entirely when none is passed in", () => {
    const block = extractBlockDef(sfc("defineProps({ heading: textField() })"), "Hero.vue");
    expect(block).not.toHaveProperty("source");
  });
});
