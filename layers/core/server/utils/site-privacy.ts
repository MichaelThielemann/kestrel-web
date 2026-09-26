import { getRequestURL, getResponseStatus, type EventHandler } from "h3";
import { withoutBlockAliases } from "../../app/utils/block-privacy";
import { MOUNT_PATH } from "../../mount-path";

const SITE_PREFIX = `${MOUNT_PATH}/site/`;

/** Wraps the API handler so a `/site/*` page answer never carries a block instance's editor-only alias. */
export function withoutSiteBlockAliases(inner: EventHandler): EventHandler {
  return async (event) => {
    const answer: unknown = await inner(event);
    if (getResponseStatus(event) !== 200 || typeof answer !== "string" || !getRequestURL(event).pathname.startsWith(SITE_PREFIX) || !answer.includes('"alias"')) {
      return answer;
    }
    let body: unknown;
    try {
      body = JSON.parse(answer);
    } catch {
      return answer;
    }
    return JSON.stringify(withoutBlockAliases(body));
  };
}
