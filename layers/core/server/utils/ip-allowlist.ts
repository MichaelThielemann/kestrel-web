import type { IncomingMessage } from "node:http";
import { BlockList, isIP, Socket } from "node:net";
import type { ClientAddress, ClientIpOptions, PeerRequest } from "@michaelthielemann/kestrel";
import { createError, type H3Event } from "h3";

export type AccessScope = "admin" | "site";

const ADMIN_PATHS = [/^\/admin(\/|$)/, /^\/api\/admin(\/|$)/, /^\/api\/login$/, /^\/api\/logout$/, /^\/api\/me(\/|$)/, /^\/api\/users(\/|$)/, /^\/api\/migrations(\/|$)/];
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function accessScope(path: string, method: string): AccessScope {
  const pathname = path.split("?")[0] ?? path;
  if (ADMIN_PATHS.some((pattern) => pattern.test(pathname))) return "admin";
  if (pathname.startsWith("/api/") && !READ_METHODS.has(method.toUpperCase())) return "admin";
  return "site";
}

function parseEntry(entry: string): { address: string; prefix: number; family: "ipv4" | "ipv6" } {
  const [address, prefixText, ...rest] = entry.split("/");
  const family = isIP(address ?? "");
  if (!address || family === 0 || rest.length > 0) throw new Error(`ip allowlist: invalid entry "${entry}"`);
  const bits = family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) throw new Error(`ip allowlist: invalid prefix in "${entry}"`);
  return { address, prefix, family: family === 4 ? "ipv4" : "ipv6" };
}

export function parseAllowlist(text: string | undefined): BlockList | null {
  const entries = (text ?? "").split(/[\s,]+/).filter((part) => part !== "");
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    list.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return list;
}

export function normalizeAddress(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] ?? address;
}

export function isAllowed(list: BlockList | null, address: string | undefined): boolean {
  if (list === null) return true;
  if (!address) return false;
  const normalized = normalizeAddress(address);
  const family = isIP(normalized);
  if (family === 0) return false;
  return list.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

/** How the client address of a request is derived: the core's peer policy, with `""` for no trusted header. */
export interface ClientAddressPolicy {
  trustProxy: boolean;
  proxyHops: number;
  trustedHeader: string;
  /** Peers whose forwarding headers count; empty means the core's default, loopback. */
  trustedProxies: string[];
}

/** The `ClientIpOptions` of the core and the h3 adapter for a policy. */
export function clientIpOptions(policy: ClientAddressPolicy): ClientIpOptions {
  const { trustProxy, proxyHops, trustedHeader, trustedProxies } = policy;
  return { trustProxy, proxyHops, ...(trustedHeader === "" ? {} : { trustedHeader }), ...(trustedProxies.length === 0 ? {} : { trustedProxies }) };
}

/** The entries of a comma- or whitespace-separated list, such as `trustedProxies` from the environment. */
export function listEntries(text: string | undefined): string[] {
  return (text ?? "").split(/[\s,]+/).filter((part) => part !== "");
}

/**
 * The path the API adapter routes for a request target: dot segments resolved as a URL parser does, then
 * each segment percent-decoded. Access decisions use it so they see the path the router sees.
 */
export function routedPath(target: string): string {
  const pathname = new URL(target.replace(/^[/\\]+/, "/"), "http://localhost").pathname;
  return pathname.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }).join("/");
}

/** Whether Nitro made the request in-process (`localFetch` during SSR or a publish) rather than over a connection. */
export function isInProcess(req: Pick<IncomingMessage, "socket">): boolean {
  const socket: unknown = req.socket;
  return !(socket instanceof Socket) && typeof socket === "object" && socket !== null && "__unenv__" in socket;
}

/** What `guardAccess` checks a request against. */
export interface AccessRules {
  admin: BlockList | null;
  site: BlockList | null;
  resolve: (req: PeerRequest) => ClientAddress;
  /** Told the peer of each request whose forwarding headers were ignored; rate-limits its own output. */
  warnForwarding?: (peer: string | undefined) => void;
}

/** The liveness and readiness routes a load balancer or platform probes, often without the proxy's client header. */
export const PROBE_PATHS: ReadonlySet<string> = new Set(["/api/health", "/api/ready"]);

const withoutClientHeader = new WeakSet<H3Event>();

/** Whether `guardAccess` admitted this probe although the trusted header was missing; its answer should then say no more than up or down. */
export function answeredWithoutClientHeader(event: H3Event): boolean {
  return withoutClientHeader.has(event);
}

/** A probe answer cut to its `ok` or `ready` member when the probe came without the trusted header. */
export function probeBody(event: H3Event, body: object, key: "ok" | "ready"): object {
  if (!answeredWithoutClientHeader(event)) return body;
  const value: unknown = Reflect.get(body, key);
  return { [key]: value };
}

function isProbe(event: H3Event): boolean {
  if (event.method !== "GET" && event.method !== "HEAD") return false;
  const target = event.node.req.originalUrl ?? event.path;
  return PROBE_PATHS.has(target.split("?", 1)[0] ?? "");
}

/**
 * Refuses a request with 403 when a trusted proxy sent it without the trusted header, or when its client
 * address is outside the list of its scope. A probe of `PROBE_PATHS` without the trusted header is judged
 * by its peer address instead and marked for a minimal answer. In-process requests pass.
 */
export function guardAccess(event: H3Event, rules: AccessRules): void {
  const req = event.node.req;
  if (isInProcess(req)) return;
  const client = rules.resolve(req);
  if (client.forwardingIgnored) rules.warnForwarding?.(req.socket?.remoteAddress);
  const probe = client.missingHeader && isProbe(event);
  const address = probe ? req.socket?.remoteAddress : client.ip;
  const list = rules[accessScope(routedPath(req.originalUrl ?? event.path), event.method)];
  if ((!client.missingHeader || probe) && isAllowed(list, address)) {
    if (probe) withoutClientHeader.add(event);
    return;
  }
  throw createError({ statusCode: 403, statusMessage: "Forbidden" });
}
