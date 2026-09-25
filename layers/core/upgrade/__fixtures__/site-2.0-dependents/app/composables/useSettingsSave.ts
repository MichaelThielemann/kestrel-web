export async function saveSettings(body: Record<string, unknown>): Promise<number> {
  const saved = await $fetch<{ _llms?: { entries: number } }>("/api/settings", { method: "PUT", body });
  return saved._llms?.entries ?? 0;
}
