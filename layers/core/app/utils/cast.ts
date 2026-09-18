export type Boundary = "json" | "ast" | "dom" | "host";

export function boundaryCast<T>(value: unknown, boundary: Boundary): T {
  void boundary;
   
  return value as T;
}
