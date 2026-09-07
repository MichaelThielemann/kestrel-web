export type Boundary = "json" | "ast" | "dom" | "host";

export function boundaryCast<T>(value: unknown, boundary: Boundary): T {
  void boundary;
  // eslint-disable-next-line no-restricted-syntax
  return value as unknown as T;
}
