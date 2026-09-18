import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import { getKestrel } from "../plugins/kestrel";
import { uploadLimits } from "../utils/limits";

export default defineEventHandler(async () => ({ maxUploadBytes: uploadLimits(await getKestrel(), modules, config.modules).maxUploadBytes }));
