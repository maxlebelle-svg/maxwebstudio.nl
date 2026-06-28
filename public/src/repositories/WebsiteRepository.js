import { PRIMARY_MODULE_KEYS } from "../config/storageKeys.js";
import { createRepository } from "./createRepository.js";

export const WebsiteRepository = createRepository(PRIMARY_MODULE_KEYS.websites);
