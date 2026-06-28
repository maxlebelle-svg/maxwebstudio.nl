import { PRIMARY_MODULE_KEYS } from "../config/storageKeys.js";
import { createRepository } from "./createRepository.js";

export const FileRepository = createRepository(PRIMARY_MODULE_KEYS.files);
