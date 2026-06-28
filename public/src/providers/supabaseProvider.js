import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { getSupabaseClient, getSupabaseClientStatus } from "./supabaseClient.js";

function isCustomersTable(table) {
  return table === "customers" || table === "maxwebstudioCrmCustomers" || table === "maxwebstudioCustomers";
}

function isWebsitesTable(table) {
  return table === "websites" || table === "maxwebstudioManagedSites" || table === "maxwebstudioWebsites";
}

function normalizedTable(table) {
  if (isCustomersTable(table)) return "customers";
  if (isWebsitesTable(table)) return "websites";
  return table;
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

function isMigrationMode() {
  return getCurrentProviderType() === PROVIDERS.SUPABASE_MIGRATION;
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

function isCustomerMigrationRecord(record = {}) {
  return record.source === "localStorage"
    && Boolean(record.metadata?.localStorageId || record.id)
    && record.environment !== "test"
    && record.metadata?.migrationPreparedBy === "customerMigrationService";
}

async function getWriteClient({ allowMigration = false } = {}) {
  if (!isWriteTestMode() && !(allowMigration && isMigrationMode())) {
    throw new Error("Supabase writes zijn alleen toegestaan in supabase-write-test of gecontroleerde supabase-migration mode.");
  }
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; write-test blijft geblokkeerd.");
  return client;
}

async function getCustomerWriteClient(context = {}) {
  if (context.customerWrite !== true) throw new Error("Customer write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; customer write blijft geblokkeerd.");
  return client;
}

function assertCustomerWriteTable(table) {
  if (!isCustomersTable(table)) throw new Error("Customer writes ondersteunen alleen de customers tabel.");
}

async function getWebsiteWriteClient(context = {}) {
  if (context.websiteWrite !== true) throw new Error("Website write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; website write blijft geblokkeerd.");
  return client;
}

function assertWebsiteWriteTable(table) {
  if (!isWebsitesTable(table)) throw new Error("Website writes ondersteunen alleen de websites tabel.");
}

export const supabaseProvider = {
  type: "supabase-readonly",
  status: "read-only",

  async getAll(table, options = {}) {
    if (!isCustomersTable(table) && !isWebsitesTable(table)) {
      console.info(preparedMessage(table));
      return [];
    }
    const normalized = normalizedTable(table);
    const client = await getReadClient(normalized);
    const limit = Math.min(Number(options.limit || 10), 100);
    const { data, error } = await client.from(normalized).select("*").limit(limit);
    if (error) throw new Error(error.message || `${normalized} lezen uit Supabase is mislukt.`);
    return Array.isArray(data) ? data : [];
  },

  async getById(table, id) {
    if (!isCustomersTable(table) && !isWebsitesTable(table)) {
      console.info(preparedMessage(table));
      return null;
    }
    const normalized = normalizedTable(table);
    const client = await getReadClient(normalized);
    const { data, error } = await client.from(normalized).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message || `${normalized} lezen uit Supabase is mislukt.`);
    return data || null;
  },

  async create(table, record = {}) {
    if (!isCustomersTable(table)) throw new Error("Supabase write-test ondersteunt alleen de customers tabel.");
    if (isWriteTestMode() && !isSafeTestCustomer(record) && !isCustomerMigrationRecord(record)) {
      throw new Error("Alleen de veilige Supabase Write Test Klant of gecontroleerde customer migratierecords mogen worden aangemaakt in write-test mode.");
    }
    if (isMigrationMode() && !isCustomerMigrationRecord(record)) throw new Error("Alleen gecontroleerde customer migratierecords mogen worden aangemaakt in supabase-migration mode.");
    const client = await getWriteClient({ allowMigration: true });
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

  async createCustomer(record = {}, context = {}) {
    assertCustomerWriteTable("customers");
    const client = await getCustomerWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("customers").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Customer aanmaken in Supabase is mislukt.");
    return { success: true, table: "customers", action: "create_customer", data };
  },

  async updateCustomer(id, updates = {}, context = {}) {
    assertCustomerWriteTable("customers");
    const client = await getCustomerWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("customers").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Customer bijwerken in Supabase is mislukt.");
    return { success: true, table: "customers", action: "update_customer", data };
  },

  async archiveCustomer(id, context = {}) {
    return this.updateCustomer(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, context);
  },

  async reactivateCustomer(id, context = {}) {
    return this.updateCustomer(id, {
      status: "active",
      deleted_at: null,
    }, context);
  },

  async createWebsite(record = {}, context = {}) {
    assertWebsiteWriteTable("websites");
    const client = await getWebsiteWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("websites").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Website aanmaken in Supabase is mislukt.");
    return { success: true, table: "websites", action: "create_website", data };
  },

  async updateWebsite(id, updates = {}, context = {}) {
    assertWebsiteWriteTable("websites");
    const client = await getWebsiteWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("websites").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Website bijwerken in Supabase is mislukt.");
    return { success: true, table: "websites", action: "update_website", data };
  },

  async archiveWebsite(id, context = {}) {
    return this.updateWebsite(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, context);
  },

  async reactivateWebsite(id, context = {}) {
    return this.updateWebsite(id, {
      status: "active",
      deleted_at: null,
    }, context);
  },

  setAll() {
    return writeBlocked();
  },

  async count(table) {
    if (!isCustomersTable(table) && !isWebsitesTable(table)) {
      console.info(preparedMessage(table));
      return 0;
    }
    const normalized = normalizedTable(table);
    const client = await getReadClient(normalized);
    const { count, error } = await client.from(normalized).select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message || `${normalized} tellen uit Supabase is mislukt.`);
    return count ?? 0;
  },

  async findDuplicateCustomer(record = {}) {
    const client = await getReadClient("customers");
    const warnings = [];
    const checks = [
      record.id && { type: "id", query: () => client.from("customers").select("id,email,company_name,phone").eq("id", record.id).maybeSingle() },
      record.metadata?.localStorageId && { type: "external_id", query: () => client.from("customers").select("id,email,company_name,phone").eq("external_id", record.metadata.localStorageId).maybeSingle() },
      record.email && { type: "email", query: () => client.from("customers").select("id,email,company_name,phone").eq("email", record.email).maybeSingle() },
      record.company_name && record.phone && {
        type: "company_phone",
        query: () => client.from("customers").select("id,email,company_name,phone").eq("company_name", record.company_name).eq("phone", record.phone).maybeSingle(),
      },
    ].filter(Boolean);
    for (const check of checks) {
      try {
        const { data, error } = await check.query();
        if (error) throw error;
        if (data?.id) return { duplicate: true, type: check.type, data, warning: warnings.join(" ") };
      } catch (error) {
        warnings.push(`${check.type}: ${error.message || "Remote duplicate-check mislukt."}`);
      }
    }
    return { duplicate: false, type: "", data: null, warning: warnings.join(" ") };
  },

  getStatus() {
    return getSupabaseClientStatus();
  },
};
