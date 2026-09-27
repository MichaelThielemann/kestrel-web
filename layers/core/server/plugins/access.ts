import type { BlockList } from "node:net";
import { clientIpResolver, consoleLogger, forwardingWarner, type ClientAddress, type PeerRequest } from "@michaelthielemann/kestrel";
import { clientIpOptions, listEntries, parseAllowlist, type ClientAddressPolicy } from "../utils/ip-allowlist";

export interface AccessLists {
  admin: BlockList | null;
  site: BlockList | null;
  policy: ClientAddressPolicy;
  resolve: (req: PeerRequest) => ClientAddress;
  warnForwarding?: (peer: string | undefined) => void;
}

const DEFAULT_POLICY: ClientAddressPolicy = { trustProxy: false, proxyHops: 1, trustedHeader: "", trustedProxies: [] };

let lists: AccessLists = { admin: null, site: null, policy: DEFAULT_POLICY, resolve: clientIpResolver(clientIpOptions(DEFAULT_POLICY)) };

export function accessLists(): AccessLists {
  return lists;
}

export default defineNitroPlugin(() => {
  const access = useRuntimeConfig().kestrel.access;
  const proxyHops = Number(access.proxyHops);
  if (!Number.isInteger(proxyHops) || proxyHops < 1) throw new Error(`ip allowlist: proxyHops must be a positive integer, got ${JSON.stringify(access.proxyHops)}`);
  const policy: ClientAddressPolicy = {
    trustProxy: access.trustProxy === true,
    proxyHops,
    trustedHeader: String(access.trustedHeader ?? "").trim().toLowerCase(),
    trustedProxies: listEntries(String(access.trustedProxies ?? "")),
  };
  const warnForwarding = forwardingWarner((message) => consoleLogger.warn?.(`ip allowlist: ${message} (NUXT_KESTREL_ACCESS_TRUSTED_PROXIES)`));
  lists = { admin: parseAllowlist(access.admin), site: parseAllowlist(access.site), policy, resolve: clientIpResolver(clientIpOptions(policy)), warnForwarding };
  if (process.env.NITRO_UNIX_SOCKET && !policy.trustProxy && policy.trustedHeader === "") {
    consoleLogger.warn?.("ip allowlist: listening on a Unix socket without trustProxy or trustedHeader; no request has a client address, so rate limits share one key and a set allowlist refuses every request");
  }
});
