import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
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

function isWriteTestMode() {
  return getCurrentProviderType() === PROVIDERS.SUPABASE_WRITE_TEST;
}

function isSafeTestCustomer(record = {}) {
  return record.company_name === "Supabase Write Test Klant"
    && record.name === "Supabase Test"
    && record.email === "supabase-write-test@maxwebstudio.nl"
    && record.is_demo === true
    && record.environment === "test"
    && record.metadata?.createdBy === "supabase-write-test"
    && record.metadata?.safeToDelete === true;
}

async function getWriteClient() {
  if (!isWriteTestMode()) throw new Error("Supabase writes zijn alleen toegestaan in supabase-write-test mode.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; write-test blijft geblokkeerd.");
  return client;
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

  async create(table, record = {}) {
    if (!isCustomersTable(table)) throw new Error("Supabase write-test ondersteunt alleen de customers tabel.");
    if (!isSafeTestCustomer(record)) throw new Error("Alleen de veilige Supabase Write Test Klant mag worden aangemaakt.");
    const client = await getWriteClient();
    const { data, error } = await client.from("customers").insert(record).select("*").single();
    if (error) throw new Error(error.message || "Testcustomer aanmaken is mislukt.");
    return { success: true, table: "customers", action: "create", data };
  },

  async update(table, id, updates = {}) {
    if (!isCustomersTable(table)) throw new Error("Supabase write-test ondersteunt alleen de customers tabel.");
    const existing = await this.getById("customers", id);
    if (!existing?.metadata?.safeToDelete || existing?.metadata?.createdBy !== "supabase-write-test") {
      throw new Error("Alleen veilige testcustomers met safeToDelete=true mogen worden bijgewerkt.");
    }
    const safeUpdates = {
      ...updates,
      metadata: {
        ...(existing.metadata || {}),
        ...(updates.metadata || {}),
        createdBy: "supabase-write-test",
        safeToDelete: true,
      },
    };
    const client = await getWriteClient();
    const { data, error } = await client.from("customers").update(safeUpdates).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Testcustomer updaten is mislukt.");
    return { success: true, table: "customers", action: "update", data };
  },

  async delete(table, id) {
    if (!isCustomersTable(table)) throw new Error("Supabase write-test ondersteunt alleen de customers tabel.");
    const existing = await this.getById("customers", id);
    if (!existing?.metadata?.safeToDelete || existing?.metadata?.createdBy !== "supabase-write-test") {
      throw new Error("Alleen testrecords met safeToDelete=true mogen worden verwijderd.");
    }
    const client = await getWriteClient();
    const { data, error } = await client.from("customers").delete().eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Testcustomer verwijderen is mislukt.");
    return { success: true, table: "customers", action: "delete", data };
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
