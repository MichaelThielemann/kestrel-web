import { isMissingAsset } from "../utils/asset-404";

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;
  if (!isMissingAsset(path)) return;
  setResponseStatus(event, 404);
  return "";
});
