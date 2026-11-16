import { normalizeSiteUrl } from "@michaelthielemann/kestrel-delivery-static/site-url";

/** The variable `nuxt dev` records the site URL it derived in, so that a reload on another port replaces it while a site URL set by hand stays. */
export const DEV_SITE_URL_ENV = "__KESTREL_DEV_SITE_URL__";

const SITE_URL_ENV = "NUXT_PUBLIC_SITE_URL";
const ANY_HOSTS = new Set(["", "0.0.0.0", "::"]);

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : undefined;
}

function addressOf(server: unknown): { address: string; port: number } | undefined {
  const address: unknown = typeof server === "object" && server !== null && "address" in server && typeof server.address === "function" ? Reflect.apply(server.address, server, []) : undefined;
  const info = recordOf(address);
  return typeof info?.address === "string" && typeof info.port === "number" ? { address: info.address, port: info.port } : undefined;
}

function isSecure(server: unknown): boolean {
  return typeof server === "object" && server !== null && "setSecureContext" in server;
}

/**
 * The origin the dev server answers on, from the arguments of Nuxt's `listen` hook: the listener's `url` (protocol,
 * host and port, with the app's base URL), or else the protocol and the address the server is bound to, where an
 * address bound to every interface reads as `localhost` and an IPv6 address is bracketed. `undefined` when
 * neither says.
 */
export function listenOrigin(server: unknown, listener: unknown): string | undefined {
  const url = recordOf(listener)?.url;
  if (typeof url === "string" && url !== "") return url;
  const bound = addressOf(server);
  if (bound === undefined) return undefined;
  const host = ANY_HOSTS.has(bound.address) ? "localhost" : bound.address.includes(":") ? `[${bound.address}]` : bound.address;
  return `${isSecure(server) ? "https" : "http"}://${host}:${String(bound.port)}`;
}

/**
 * The variables that give `nuxt dev` its own origin as the site URL: `NUXT_PUBLIC_SITE_URL` and
 * `DEV_SITE_URL_ENV`, both the normalised `origin`, when `NUXT_PUBLIC_SITE_URL` is unset, empty or the value a
 * previous call derived; nothing when it holds a site URL of its own or `origin` is no site URL.
 */
export function devSiteUrlEnv(env: Readonly<Record<string, string | undefined>>, origin: string): Record<string, string> {
  const current = env[SITE_URL_ENV];
  if (current !== undefined && current !== "" && current !== env[DEV_SITE_URL_ENV]) return {};
  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(origin);
  } catch {
    return {};
  }
  return { [SITE_URL_ENV]: siteUrl, [DEV_SITE_URL_ENV]: siteUrl };
}
