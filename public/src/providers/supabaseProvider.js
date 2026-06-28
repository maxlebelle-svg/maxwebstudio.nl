import { getSupabaseClient, getSupabaseClientStatus } from "./supabaseClient.js";

function isCustomersTable(table) {
  return table === "customers" || table === "maxwebstudioCrmCustomers" || table === "maxwebstudioCustomers";
}

function preparedMessage(table = "") {
  const status = getSupabaseClientStatus();
  const suffix = table ? ` Tabel ${table} blijft read-only.` : "";
  if (!status.configured) return `Supabase niet geconfigureerd. Vul SUPABASE_URL en SUPABASE_ANON_KEY veilig in via runtime/environment configuratie.${suffix}`;
  if (!status.clientPackageAvailable) return `Supabase client package nog niet actief; read-only check blijft geblokkeerd.${suffix}`;
  return `Supabase read-only voorbereid.${suffix}`;
}

async function getReadClient(table = "") {
  const client = await getSupabaseClient();
  if (!client) throw new Error(preparedMessage(table));
  return client;
}

function writeBlocked() {
  throw new Error("Supabase writes zijn nog geblokkeerd in read-only mode.");
}

export const supabaseProvider = {
  type: "supabase-readonly",
  status: "read-only",

  async getAll(table, options = {}) {
    if (!isCustomersTable(table)) {
      console.info(preparedMessage(table));
      return [];
    }
    const client = await getReadClient("customers");
    const limit = Math.min(Number(options.limit || 10), 50);
    const { data, error } = await client.from("customers").select("*").limit(limit);
    if (error) throw new Error(error.message || "Customers lezen uit Supabase is mislukt.");
    return Array.isArray(data) ? data : [];
  },

  async getById(table, id) {
    if (!isCustomersTable(table)) {
      console.info(preparedMessage(table));
      return null;
    }
    const client = await getReadClient("customers");
    const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message || "Customer lezen uit Supabase is mislukt.");
    return data || null;
  },

  create() {
    return writeBlocked();
  },
  update() {
    return writeBlocked();
  },
  delete() {
    return writeBlocked();
  },
  setAll() {
    return writeBlocked();
  },

  async count(table) {
    if (!isCustomersTable(table)) {
      console.info(preparedMessage(table));
      return 0;
    }
    const client = await getReadClient("customers");
    const { count, error } = await client.from("customers").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message || "Customers tellen uit Supabase is mislukt.");
    return count ?? 0;
  },

  getStatus() {
    return getSupabaseClientStatus();
  },
};
