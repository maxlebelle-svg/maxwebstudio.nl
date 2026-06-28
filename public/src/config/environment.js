export const ENVIRONMENTS = Object.freeze({
  DEMO: "DEMO",
  TEST: "TEST",
  PRODUCTION: "PRODUCTION",
});

export const PROVIDERS = Object.freeze({
  LOCAL_STORAGE: "localStorage",
  SUPABASE_PREPARED: "supabase-prepared",
  SUPABASE_READONLY: "supabase-readonly",
  SUPABASE_WRITE_TEST: "supabase-write-test",
  SUPABASE_MIGRATION: "supabase-migration",
  SUPABASE: "supabase",
});

export const CUSTOMER_DATA_MODES = Object.freeze({
  LOCAL: "local",
  SUPABASE_READ: "supabase-read",
  HYBRID: "hybrid",
});

const DEFAULT_ENVIRONMENT = ENVIRONMENTS.DEMO;
const DEFAULT_PROVIDER = PROVIDERS.LOCAL_STORAGE;

export function getCurrentEnvironment() {
  return window.__MAXWEBSTUDIO_ENV__ || localStorage.getItem("maxwebstudioEnvironment") || DEFAULT_ENVIRONMENT;
}

export function getCurrentProviderType() {
  return window.__MAXWEBSTUDIO_PROVIDER__
    || localStorage.getItem("maxwebstudioProvider")
    || localStorage.getItem("maxwebstudioDataProviderMode")
    || DEFAULT_PROVIDER;
}

export function isDemoEnvironment() {
  return getCurrentEnvironment() === ENVIRONMENTS.DEMO;
}

export function isProductionEnvironment() {
  return getCurrentEnvironment() === ENVIRONMENTS.PRODUCTION;
}

export function getEnvironmentInfo() {
  return {
    environment: getCurrentEnvironment(),
    provider: getCurrentProviderType(),
    isDemo: isDemoEnvironment(),
    isProduction: isProductionEnvironment(),
  };
}
