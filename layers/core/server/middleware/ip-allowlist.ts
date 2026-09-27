import { accessLists } from "../plugins/access";
import { guardAccess } from "../utils/ip-allowlist";

export default defineEventHandler((event) => {
  if (import.meta.dev) return;
  guardAccess(event, accessLists());
});
