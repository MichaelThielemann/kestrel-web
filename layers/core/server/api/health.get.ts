const started = Date.now();

export default defineEventHandler(() => ({ ok: true, uptimeSeconds: Math.floor((Date.now() - started) / 1000) }));
