export type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The status and parsed body of one API answer. */
export interface ApiAnswer {
  status: number;
  body: Json;
  text: string;
}

/** A small token-based client for the playground's HTTP API. */
export class Api {
  token: string | null = null;
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async raw(method: string, path: string, body?: unknown, form?: FormData): Promise<ApiAnswer> {
    const headers: Record<string, string> = {};
    if (this.token !== null) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${this.baseUrl}/api${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === "" ? {} : JSON.parse(text);
    } catch {
      parsed = {};
    }
    return { status: response.status, body: isRecord(parsed) ? parsed : { items: parsed }, text };
  }

  async call(method: string, path: string, body?: unknown, form?: FormData): Promise<Json> {
    const answer = await this.raw(method, path, body, form);
    if (answer.status >= 400) throw new Error(`${method} ${path} answered ${answer.status}: ${answer.text.slice(0, 400)}`);
    return answer.body;
  }

  async login(username: string, password: string): Promise<this> {
    const session = await this.call("POST", "/login", { username, password });
    if (typeof session.token !== "string") throw new Error(`login as ${username} returned no token`);
    this.token = session.token;
    return this;
  }

  upload(filename: string, bytes: Buffer, folder?: string): Promise<Json> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);
    if (folder !== undefined) form.append("folder", folder);
    return this.call("POST", "/media", undefined, form);
  }
}

/** Reads a string id off an API answer. */
export function idOf(value: Json): string {
  if (typeof value.id !== "string") throw new Error(`expected an id in ${JSON.stringify(value).slice(0, 200)}`);
  return value.id;
}

/** Polls until `check` holds or the deadline passes. */
export async function until(what: string, check: () => Promise<boolean> | boolean, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`${what} did not happen within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
