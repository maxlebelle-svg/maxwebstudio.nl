import { getSupabaseClientStatus } from "./supabaseClient.js";

function preparedMessage() {
  const status = getSupabaseClientStatus();
  if (!status.configured) return "Supabase niet geconfigureerd. Vul SUPABASE_URL en SUPABASE_ANON_KEY veilig in via environment variables.";
  return "Supabase voorbereid, live queries komen in Fase 11.5/11.6.";
}

function readNotActive() {
  console.info(preparedMessage());
  return [];
}

function writeNotActive() {
  throw new Error(preparedMessage());
}

export const supabaseProvider = {
  type: "supabase-prepared",
  status: "prepared",

  getAll() {
    return readNotActive();
  },
  getById() {
    console.info(preparedMessage());
    return null;
  },
  create() {
    return writeNotActive();
  },
  update() {
    return writeNotActive();
  },
  delete() {
    return writeNotActive();
  },
  setAll() {
    return writeNotActive();
  },
  count() {
    console.info(preparedMessage());
    return 0;
  },
  getStatus() {
    return getSupabaseClientStatus();
  },
};
