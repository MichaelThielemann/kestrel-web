import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import { uploadLimits } from "../utils/limits";

export default defineEventHandler(() => ({ maxUploadBytes: uploadLimits(modules, config.modules).maxUploadBytes }));
