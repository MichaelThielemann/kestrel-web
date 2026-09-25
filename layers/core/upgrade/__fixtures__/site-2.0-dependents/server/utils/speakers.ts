export const cachedSpeakers = defineCachedFunction(async (): Promise<string[]> => ["Ada", "Grace"], { maxAge: 60 });
