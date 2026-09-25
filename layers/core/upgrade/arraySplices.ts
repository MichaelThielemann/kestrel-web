import { arrayElements, span } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { AstNode } from "@michaelthielemann/kestrel-upgrade/codemods";

/** A replacement of `source.slice(start, end)` by `text`; `start === end` inserts. */
export interface Splice {
  start: number;
  end: number;
  text: string;
}

/** Applies non-overlapping splices to `source`; two splices never share a start offset. */
export function applySplices(source: string, splices: readonly Splice[]): string {
  let text = source;
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) text = text.slice(0, splice.start) + splice.text + text.slice(splice.end);
  return text;
}

function commaBetween(source: string, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      if (newline === -1 || newline >= to) return -1;
      i = newline;
    } else if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i + 2);
      if (close === -1 || close >= to) return -1;
      i = close + 1;
    } else if (source[i] === ",") {
      return i;
    }
  }
  return -1;
}

function lineEndAfter(source: string, from: number, to: number): number {
  let i = from;
  while (i < to) {
    const char = source[i];
    if (char === "\n") return i;
    if (char === " " || char === "\t" || char === "\r") {
      i++;
    } else if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      return newline === -1 || newline >= to ? -1 : newline;
    } else if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i + 2);
      if (close === -1 || close >= to) return -1;
      i = close + 2;
    } else {
      return -1;
    }
  }
  return -1;
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart, offset))?.[0] ?? "";
}

function gapAfter(array: AstNode, index: number): { from: number; to: number } {
  const elements = arrayElements(array);
  const next = elements[index + 1];
  return { from: span(elements[index]!).end, to: next === undefined ? span(array).end - 1 : span(next).start };
}

/**
 * Inserts `literals` right after element `index` of `array`, in the array's own layout: one per line at the
 * element's indentation when the element ends its line, inline otherwise. Comments in the gap keep their
 * place: a comment after the element's comma stays on the element's line, one on a later line stays with
 * the element it precedes.
 */
export function insertAfterElement(source: string, array: AstNode, index: number, literals: readonly string[]): Splice[] {
  const { from, to } = gapAfter(array, index);
  const indent = lineIndent(source, span(arrayElements(array)[index]!).start);
  const comma = commaBetween(source, from, to);
  if (comma !== -1) {
    const lineEnd = lineEndAfter(source, comma + 1, to);
    return lineEnd === -1
      ? [{ start: comma + 1, end: comma + 1, text: literals.map((l) => ` ${l},`).join("") }]
      : [{ start: lineEnd, end: lineEnd, text: literals.map((l) => `\n${indent}${l},`).join("") }];
  }
  const lineEnd = lineEndAfter(source, from, to);
  if (lineEnd === -1) {
    const at = from + source.slice(from, to).trimEnd().length;
    return [{ start: at, end: at, text: literals.map((l) => `, ${l}`).join("") }];
  }
  const lines = literals.map((l) => `\n${indent}${l}`).join(",");
  return lineEnd === from ? [{ start: from, end: from, text: `,${lines}` }] : [{ start: from, end: from, text: "," }, { start: lineEnd, end: lineEnd, text: lines }];
}

/**
 * Removes element `index` of `array` with one separator. An element on a line of its own goes with its
 * whole line, including a comment after it on that line; any other comment stays.
 */
export function removeElement(source: string, array: AstNode, index: number): Splice[] {
  const elements = arrayElements(array);
  const { start, end } = span(elements[index]!);
  const previous = elements[index - 1];
  const { to } = gapAfter(array, index);
  const comma = commaBetween(source, end, to);
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = lineEndAfter(source, comma === -1 ? end : comma + 1, to);
  const previousComma = previous === undefined ? -1 : commaBetween(source, span(previous).end, start);
  if (/^[ \t]*$/.test(source.slice(lineStart, start)) && lineEnd !== -1) {
    const line = { start: lineStart, end: lineEnd + 1, text: "" };
    return comma === -1 && previousComma !== -1 ? [line, { start: previousComma, end: previousComma + 1, text: "" }] : [line];
  }
  if (comma !== -1) {
    let stop = comma + 1;
    while (source[stop] === " " || source[stop] === "\t") stop++;
    return [{ start, end: stop, text: "" }];
  }
  return previousComma === -1 ? [{ start, end, text: "" }] : [{ start: previousComma, end, text: "" }];
}

/** Wraps elements `from`..`to` (inclusive) of `array` in `{ atomic: [...] }`, keeping their source text and anything between them verbatim. */
export function wrapElements(array: AstNode, from: number, to: number): Splice[] {
  const elements = arrayElements(array);
  const start = span(elements[from]!).start;
  const end = span(elements[to]!).end;
  return [
    { start, end: start, text: "{ atomic: [" },
    { start: end, end, text: "] }" },
  ];
}
