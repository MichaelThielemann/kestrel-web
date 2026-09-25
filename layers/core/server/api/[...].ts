import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { KestrelHandlers } from "../utils/kestrel-handlers";

export default defineEventHandler(async (event) => {
  const { kestrelHandler } = boundaryCast<KestrelHandlers>(useNitroApp(), "host");
  const handler = await kestrelHandler;
  const response: unknown = await handler(event);
  return response;
});
