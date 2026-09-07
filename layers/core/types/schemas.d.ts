declare module "#kestrel/schemas" {
  const bundle: { mode: "paths"; schemas: Record<string, string> } | { mode: "inline"; schemas: Record<string, unknown> };
  export default bundle;
}

export {};
