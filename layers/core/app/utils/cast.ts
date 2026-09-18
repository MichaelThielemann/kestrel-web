export type Boundary = "json" | "ast" | "dom" | "host";

export function boundaryCast<T>(value: unknown, boundary: Boundary): T {
  void boundary;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- boundaryCast is the sanctioned escape hatch for a JSON/AST/DOM/host boundary; this is its one necessary unsafe cast
  return value as T;
}
