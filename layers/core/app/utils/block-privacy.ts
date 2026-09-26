import { boundaryCast } from "./cast";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripped(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripped);
  if (!isRecord(value)) return value;
  const isBlockNode = typeof value.type === "string";
  const out: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) {
    if (isBlockNode && key === "alias") continue;
    out[key] = stripped(member);
  }
  return out;
}

/**
 * A value with every block instance's `alias` removed, recursively through arrays, objects and slots.
 * `alias` is editor-only metadata (the page builder's search); it never has a reason to reach a renderer,
 * public or otherwise, so it is dropped wherever a record also carries a `type` string (a block node's
 * own shape), at any depth.
 */
export function withoutBlockAliases<T>(value: T): T {
  return boundaryCast<T>(stripped(value), "json");
}
