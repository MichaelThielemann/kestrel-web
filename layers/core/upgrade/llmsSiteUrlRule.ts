import { join } from "node:path";
import { findCalls, firstArgument, objectProperty, parseTs, span } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, SourceRule } from "@michaelthielemann/kestrel-upgrade/plugin";
import { removeObjectProperty } from "./edits";
import { autoFinding, docsAnchor } from "./ruleHelpers";

const RULE = "preset/llms-site-url";

/**
 * `presetModuleConfig()` refuses `llms.siteUrl` and takes the site URL only from `NUXT_PUBLIC_SITE_URL`, so a 2.x
 * `presetModuleConfig({ llms: { siteUrl } })` stops `kestrel.config.ts` from loading. A source rule, so it still runs
 * on such a project: it removes the key (the whole `llms` option when nothing else is left in it) and names the
 * value, which belongs in `NUXT_PUBLIC_SITE_URL` wherever the server runs.
 */
export const llmsSiteUrlRule: SourceRule = {
  id: RULE,
  needs: "source",
  check(ctx) {
    const file = join(ctx.root, "kestrel.config.ts");
    const source = ctx.readFile(file);
    if (source === undefined) return [];
    const findings: Finding[] = [];
    for (const call of findCalls(parseTs(source), "presetModuleConfig")) {
      const options = firstArgument(call);
      const llms = options === undefined ? undefined : objectProperty(options, "llms");
      const value = llms?.type === "ObjectExpression" ? objectProperty(llms, "siteUrl") : undefined;
      if (options === undefined || llms === undefined || value === undefined) continue;
      const alone = Array.isArray(llms.properties) && llms.properties.length === 1;
      const edit = alone ? removeObjectProperty(file, options, "llms") : removeObjectProperty(file, llms, "siteUrl");
      if (edit === undefined) continue;
      const { start, end } = span(value);
      const message = "presetModuleConfig() refuses llms.siteUrl: sitemap.xml, llms.txt and every page's canonical link, og:url and og:image take the site URL from NUXT_PUBLIC_SITE_URL, so kestrel.config.ts does not load";
      const suggestion = `removes llms.siteUrl; set NUXT_PUBLIC_SITE_URL to its value, ${source.slice(start, end)}, wherever the server runs`;
      findings.push(autoFinding(findings.length === 0 ? RULE : `${RULE}:${findings.length}`, RULE, { file }, message, suggestion, [edit], docsAnchor("preset-llms-site-url")));
    }
    return findings;
  },
};
