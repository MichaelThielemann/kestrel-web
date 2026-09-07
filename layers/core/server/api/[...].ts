import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { EventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const { kestrelHandler } = boundaryCast<{ kestrelHandler: Promise<EventHandler> }>(useNitroApp(), "host");
  const handler = await kestrelHandler;
  const response: unknown = await handler(event);
  return response;
});
