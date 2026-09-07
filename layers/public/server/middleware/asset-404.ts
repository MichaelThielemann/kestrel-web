

const FILE_PATH = /\.[a-z0-9]{1,8}$/i;
const PASS = /^\/(api|_nuxt|__nuxt|_ipx)\//;

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname;
  if (!FILE_PATH.test(path) || PASS.test(path) || path.endsWith(".html")) return;
  setResponseStatus(event, 404);
  return "";
});
