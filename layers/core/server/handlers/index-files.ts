import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import type { KestrelHandlers } from "../utils/kestrel-handlers";

export default defineEventHandler(async (event) => {
  const { indexFileHandler } = boundaryCast<KestrelHandlers>(useNitroApp(), "host");
  const handler = await indexFileHandler;
  const response: unknown = await handler(event);
  return response;
});
