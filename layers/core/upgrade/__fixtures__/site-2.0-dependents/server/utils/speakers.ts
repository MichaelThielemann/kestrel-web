export const cachedSpeakers = defineCachedFunction(async () => $fetch("/api/speakers"), { maxAge: 60 });
