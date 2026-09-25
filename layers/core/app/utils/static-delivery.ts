import { DELIVERY_ATTRIBUTE, STATIC_DELIVERY } from "@michaelthielemann/kestrel-renderer-nuxt/static-marker";

/**
 * Whether the page in this browser tab was exported for a static host (its `<html>` carries
 * `data-kestrel-delivery="static"`). Always `false` on the server. Use it in event handlers and
 * `onMounted`, never to decide markup: the server renders every page as a live page.
 */
export function isStaticDelivery(): boolean {
  if (!import.meta.client) return false;
  return document.documentElement.getAttribute(DELIVERY_ATTRIBUTE) === STATIC_DELIVERY;
}
