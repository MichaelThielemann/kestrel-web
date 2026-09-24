import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { EventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const { publicMediaHandler } = boundaryCast<{ publicMediaHandler: Promise<EventHandler> }>(useNitroApp(), "host");
  const handler = await publicMediaHandler;
  const response: unknown = await handler(event);
  return response;
});
