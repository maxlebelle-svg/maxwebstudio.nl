import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { localStorageProvider } from "./localStorageProvider.js";
import { supabaseProvider } from "./supabaseProvider.js";

export function getProvider(providerType = getCurrentProviderType()) {
  if (providerType === PROVIDERS.SUPABASE) return supabaseProvider;
  return localStorageProvider;
}

export function getProviderInfo() {
  const provider = getProvider();
  return {
    type: provider.type,
    status: provider.status,
  };
}
