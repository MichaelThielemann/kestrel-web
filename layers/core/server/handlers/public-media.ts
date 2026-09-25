import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { KestrelHandlers } from "../utils/kestrel-handlers";

export default defineEventHandler(async (event) => {
  const { publicMediaHandler } = boundaryCast<KestrelHandlers>(useNitroApp(), "host");
  const handler = await publicMediaHandler;
  const response: unknown = await handler(event);
  return response;
});
