import type { BlockList } from "node:net";
import { parseAllowlist, type ClientAddressPolicy } from "../utils/ip-allowlist";

export interface AccessLists {
  admin: BlockList | null;
  site: BlockList | null;
  policy: ClientAddressPolicy;
}

let lists: AccessLists = { admin: null, site: null, policy: { trustProxy: false, proxyHops: 1, trustedHeader: "" } };

export function accessLists(): AccessLists {
  return lists;
}

export default defineNitroPlugin(() => {
  const access = useRuntimeConfig().kestrel.access;
  const proxyHops = Number(access.proxyHops);
  if (!Number.isInteger(proxyHops) || proxyHops < 1) throw new Error(`ip allowlist: proxyHops must be a positive integer, got ${JSON.stringify(access.proxyHops)}`);
  lists = {
    admin: parseAllowlist(access.admin),
    site: parseAllowlist(access.site),
    policy: { trustProxy: access.trustProxy === true, proxyHops, trustedHeader: String(access.trustedHeader ?? "").trim().toLowerCase() },
  };
});
