import { PRIMARY_MODULE_KEYS } from "../config/storageKeys.js";
import { createRepository } from "./createRepository.js";

export const LeadRepository = createRepository(PRIMARY_MODULE_KEYS.leads);
