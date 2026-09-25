import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LAYER_DIRS = ["layers/core", "layers/admin", "layers/public", "playground/app"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function templateOf(source: string): string {
  const open = /<template(\s[^>]*)?>/.exec(source);
  const close = source.lastIndexOf("</template>");
  if (!open || close < open.index) return "";
  return source.slice(open.index, close);
}

describe("markup never depends on the delivery target", () => {
  it("finds no isStaticDelivery in a template of a scanned fixture", () => {
    expect(templateOf('<template><p v-if="isStaticDelivery()">x</p></template>\n<script setup lang="ts">\n</script>')).toMatch(/isStaticDelivery/);
    expect(templateOf('<script setup lang="ts">\nonMounted(() => isStaticDelivery())\n</script>\n<template><p>x</p></template>')).not.toMatch(/isStaticDelivery/);
  });

  const files = LAYER_DIRS.flatMap((dir) => walk(join(ROOT, dir))).filter((file) => file.endsWith(".vue"));

  it("scans the Vue components of every layer", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const relative = file.slice(ROOT.length);
    it(`${relative} does not read isStaticDelivery() in its template`, () => {
      expect(templateOf(readFileSync(file, "utf-8"))).not.toMatch(/\bisStaticDelivery\b/);
    });
  }
});
