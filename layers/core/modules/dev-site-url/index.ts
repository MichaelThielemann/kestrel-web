import { defineNuxtModule, useLogger } from "@nuxt/kit";
import { devSiteUrlEnv, listenOrigin } from "./site-url";

export default defineNuxtModule({
  meta: { name: "kestrel-dev-site-url" },
  setup(_options, nuxt) {
    if (!nuxt.options.dev) return;
    const logger = useLogger("kestrel");
    nuxt.hook("listen", (server, listener) => {
      const origin = listenOrigin(server, listener);
      if (origin === undefined) return;
      const derived = devSiteUrlEnv(process.env, origin);
      if (derived.NUXT_PUBLIC_SITE_URL === undefined) return;
      const changed = process.env.NUXT_PUBLIC_SITE_URL !== derived.NUXT_PUBLIC_SITE_URL;
      Object.assign(process.env, derived);
      if (changed) logger.info(`NUXT_PUBLIC_SITE_URL is not set – nuxt dev uses ${derived.NUXT_PUBLIC_SITE_URL} as the site URL`);
    });
  },
});
