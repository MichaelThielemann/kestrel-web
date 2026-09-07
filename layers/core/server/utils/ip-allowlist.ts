import { BlockList, isIP } from "node:net";

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

export interface ClientAddressSources {
  socket: string | undefined;
  forwardedFor: string | undefined;
  trustedHeader: string | undefined;
}

export interface ClientAddressPolicy {
  trustProxy: boolean;
  proxyHops: number;
  trustedHeader: string;
}

function firstAddress(value: string | undefined): string | undefined {
  const first = (value ?? "").split(",")[0]?.trim();
  return first ? first : undefined;
}

export function clientAddress(sources: ClientAddressSources, policy: ClientAddressPolicy): string | undefined {
  if (policy.trustedHeader !== "") return firstAddress(sources.trustedHeader);
  if (!policy.trustProxy) return sources.socket;
  const chain = (sources.forwardedFor ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (chain.length === 0) return sources.socket;
  const hops = Math.max(1, Math.trunc(policy.proxyHops));
  return chain[chain.length - hops];
}
