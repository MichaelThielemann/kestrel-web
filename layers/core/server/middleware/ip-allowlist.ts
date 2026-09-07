import { getRequestHeader } from "h3";
import { accessLists } from "../plugins/access";
import { accessScope, clientAddress, isAllowed } from "../utils/ip-allowlist";

export default defineEventHandler((event) => {
  const lists = accessLists();
  const list = lists[accessScope(event.path, event.method)];
  if (list === null) return;
  const socket = event.node.req.socket?.remoteAddress;
  if (!socket) return;
  const address = clientAddress(
    {
      socket,
      forwardedFor: getRequestHeader(event, "x-forwarded-for"),
      trustedHeader: lists.policy.trustedHeader === "" ? undefined : getRequestHeader(event, lists.policy.trustedHeader),
    },
    lists.policy,
  );
  if (isAllowed(list, address)) return;
  throw createError({ statusCode: 403, statusMessage: "Forbidden" });
});
