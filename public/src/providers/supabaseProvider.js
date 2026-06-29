import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { getSupabaseClient, getSupabaseClientStatus } from "./supabaseClient.js";

function isCustomersTable(table) {
  return table === "customers" || table === "maxwebstudioCrmCustomers" || table === "maxwebstudioCustomers";
}

function isProfilesTable(table) {
  return table === "profiles" || table === "maxwebstudioProfiles";
}

function isWebsitesTable(table) {
  return table === "websites" || table === "maxwebstudioManagedSites" || table === "maxwebstudioWebsites";
}

function isProjectsTable(table) {
  return table === "projects" || table === "maxwebstudioProjects";
}

function isQuotesTable(table) {
  return table === "quotes" || table === "maxwebstudioQuotes";
}

function isQuoteLinesTable(table) {
  return table === "quote_lines" || table === "maxwebstudioQuoteLines";
}

function isInvoicesTable(table) {
  return table === "invoices" || table === "maxwebstudioInvoices";
}

function isInvoiceLinesTable(table) {
  return table === "invoice_lines" || table === "maxwebstudioInvoiceLines";
}

function isSubscriptionsTable(table) {
  return table === "subscriptions" || table === "maxwebstudioSubscriptions";
}

function normalizedTable(table) {
  if (isProfilesTable(table)) return "profiles";
  if (isCustomersTable(table)) return "customers";
  if (isWebsitesTable(table)) return "websites";
  if (isProjectsTable(table)) return "projects";
  if (isQuotesTable(table)) return "quotes";
  if (isQuoteLinesTable(table)) return "quote_lines";
  if (isInvoicesTable(table)) return "invoices";
  if (isInvoiceLinesTable(table)) return "invoice_lines";
  if (isSubscriptionsTable(table)) return "subscriptions";
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

async function getProfileWriteClient(context = {}) {
  if (context.profileWrite !== true) throw new Error("Profile write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; profile write blijft geblokkeerd.");
  return client;
}

function assertProfileWriteTable(table) {
  if (!isProfilesTable(table)) throw new Error("Profile writes ondersteunen alleen de profiles tabel.");
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

async function getProjectWriteClient(context = {}) {
  if (context.projectWrite !== true) throw new Error("Project write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; project write blijft geblokkeerd.");
  return client;
}

function assertProjectWriteTable(table) {
  if (!isProjectsTable(table)) throw new Error("Project writes ondersteunen alleen de projects tabel.");
}

async function getQuoteWriteClient(context = {}) {
  if (context.quoteWrite !== true) throw new Error("Quote write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; quote write blijft geblokkeerd.");
  return client;
}

function assertQuoteWriteTable(table) {
  if (!isQuotesTable(table)) throw new Error("Quote writes ondersteunen alleen de quotes tabel.");
}

async function getInvoiceWriteClient(context = {}) {
  if (context.invoiceWrite !== true) throw new Error("Invoice write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; invoice write blijft geblokkeerd.");
  return client;
}

function assertInvoiceWriteTable(table) {
  if (!isInvoicesTable(table)) throw new Error("Invoice writes ondersteunen alleen de invoices tabel.");
}

async function getSubscriptionWriteClient(context = {}) {
  if (context.subscriptionWrite !== true) throw new Error("Subscription write context ontbreekt.");
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase client niet beschikbaar; subscription write blijft geblokkeerd.");
  return client;
}

function assertSubscriptionWriteTable(table) {
  if (!isSubscriptionsTable(table)) throw new Error("Subscription writes ondersteunen alleen de subscriptions tabel.");
}

export const supabaseProvider = {
  type: "supabase-readonly",
  status: "read-only",

  async getAll(table, options = {}) {
    if (!isProfilesTable(table) && !isCustomersTable(table) && !isWebsitesTable(table) && !isProjectsTable(table) && !isQuotesTable(table) && !isQuoteLinesTable(table) && !isInvoicesTable(table) && !isInvoiceLinesTable(table) && !isSubscriptionsTable(table)) {
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
    if (!isProfilesTable(table) && !isCustomersTable(table) && !isWebsitesTable(table) && !isProjectsTable(table) && !isQuotesTable(table) && !isQuoteLinesTable(table) && !isInvoicesTable(table) && !isInvoiceLinesTable(table) && !isSubscriptionsTable(table)) {
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

  async createProfile(record = {}, context = {}) {
    assertProfileWriteTable("profiles");
    const client = await getProfileWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("profiles").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Profile aanmaken in Supabase is mislukt.");
    return { success: true, table: "profiles", action: "create_profile", data };
  },

  async updateProfile(id, updates = {}, context = {}) {
    assertProfileWriteTable("profiles");
    const client = await getProfileWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("profiles").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Profile bijwerken in Supabase is mislukt.");
    return { success: true, table: "profiles", action: "update_profile", data };
  },

  async archiveProfile(id, context = {}) {
    return this.updateProfile(id, {
      status: "archived",
      metadata: { archivedAt: new Date().toISOString() },
    }, context);
  },

  async disableProfile(id, context = {}) {
    return this.updateProfile(id, { status: "disabled" }, context);
  },

  async reactivateProfile(id, context = {}) {
    return this.updateProfile(id, { status: "active" }, context);
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

  async createProject(record = {}, context = {}) {
    assertProjectWriteTable("projects");
    const client = await getProjectWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("projects").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Project aanmaken in Supabase is mislukt.");
    return { success: true, table: "projects", action: "create_project", data };
  },

  async updateProject(id, updates = {}, context = {}) {
    assertProjectWriteTable("projects");
    const client = await getProjectWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("projects").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Project bijwerken in Supabase is mislukt.");
    return { success: true, table: "projects", action: "update_project", data };
  },

  async archiveProject(id, context = {}) {
    return this.updateProject(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, context);
  },

  async reactivateProject(id, context = {}) {
    return this.updateProject(id, {
      status: "active",
      deleted_at: null,
    }, context);
  },

  async createQuote(record = {}, lines = [], context = {}) {
    assertQuoteWriteTable("quotes");
    const client = await getQuoteWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("quotes").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Offerte aanmaken in Supabase is mislukt.");
    let savedLines = [];
    if (Array.isArray(lines) && lines.length) {
      const linePayload = lines.map((line, index) => {
        const payloadLine = {
          ...line,
          quote_id: data.id,
          sort_order: line.sort_order ?? index,
          updated_at: line.updated_at || new Date().toISOString(),
          created_at: line.created_at || new Date().toISOString(),
        };
        if (!payloadLine.id) delete payloadLine.id;
        return payloadLine;
      });
      const { data: lineData, error: lineError } = await client.from("quote_lines").insert(linePayload).select("*");
      if (lineError) throw new Error(lineError.message || "Offertregels opslaan in Supabase is mislukt.");
      savedLines = Array.isArray(lineData) ? lineData : [];
    }
    return { success: true, table: "quotes", action: "create_quote", data, lines: savedLines };
  },

  async updateQuote(id, updates = {}, lines = null, context = {}) {
    assertQuoteWriteTable("quotes");
    const client = await getQuoteWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Offerte bijwerken in Supabase is mislukt.");
    const savedLines = [];
    if (Array.isArray(lines)) {
      for (const [index, line] of lines.entries()) {
        const linePayload = {
          ...line,
          quote_id: id,
          sort_order: line.sort_order ?? index,
          updated_at: line.updated_at || new Date().toISOString(),
        };
        if (line.id) {
          const { data: lineData, error: lineError } = await client.from("quote_lines").update(linePayload).eq("id", line.id).select("*").single();
          if (lineError) throw new Error(lineError.message || "Offertregel bijwerken in Supabase is mislukt.");
          savedLines.push(lineData);
        } else {
          const insertLinePayload = {
            ...linePayload,
            created_at: line.created_at || new Date().toISOString(),
          };
          if (!insertLinePayload.id) delete insertLinePayload.id;
          const { data: lineData, error: lineError } = await client.from("quote_lines").insert(insertLinePayload).select("*").single();
          if (lineError) throw new Error(lineError.message || "Offertregel toevoegen in Supabase is mislukt.");
          savedLines.push(lineData);
        }
      }
    }
    return { success: true, table: "quotes", action: "update_quote", data, lines: savedLines };
  },

  async archiveQuote(id, context = {}) {
    return this.updateQuote(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, null, context);
  },

  async reactivateQuote(id, context = {}) {
    return this.updateQuote(id, {
      status: "draft",
      deleted_at: null,
    }, null, context);
  },

  async acceptQuote(id, context = {}) {
    return this.updateQuote(id, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
    }, null, context);
  },

  async createInvoice(record = {}, lines = [], context = {}) {
    assertInvoiceWriteTable("invoices");
    const client = await getInvoiceWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("invoices").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Factuur aanmaken in Supabase is mislukt.");
    let savedLines = [];
    if (Array.isArray(lines) && lines.length) {
      const linePayload = lines.map((line, index) => {
        const payloadLine = {
          ...line,
          invoice_id: data.id,
          sort_order: line.sort_order ?? index,
          updated_at: line.updated_at || new Date().toISOString(),
          created_at: line.created_at || new Date().toISOString(),
        };
        if (!payloadLine.id) delete payloadLine.id;
        return payloadLine;
      });
      const { data: lineData, error: lineError } = await client.from("invoice_lines").insert(linePayload).select("*");
      if (lineError) throw new Error(lineError.message || "Factuurregels opslaan in Supabase is mislukt.");
      savedLines = Array.isArray(lineData) ? lineData : [];
    }
    return { success: true, table: "invoices", action: "create_invoice", data, lines: savedLines };
  },

  async updateInvoice(id, updates = {}, lines = null, context = {}) {
    assertInvoiceWriteTable("invoices");
    const client = await getInvoiceWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("invoices").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Factuur bijwerken in Supabase is mislukt.");
    let savedLines = [];
    if (Array.isArray(lines)) {
      const linePayload = lines.map((line, index) => {
        const linePayload = {
          ...line,
          invoice_id: id,
          sort_order: line.sort_order ?? index,
          updated_at: line.updated_at || new Date().toISOString(),
        };
        if (!linePayload.id) delete linePayload.id;
        return {
          ...linePayload,
          created_at: line.created_at || new Date().toISOString(),
        };
      });
      if (linePayload.length) {
        const { data: lineData, error: lineError } = await client
          .from("invoice_lines")
          .upsert(linePayload, { onConflict: "invoice_id,external_id" })
          .select("*");
        if (lineError) throw new Error(lineError.message || "Factuurregels bijwerken in Supabase is mislukt.");
        savedLines = Array.isArray(lineData) ? lineData : [];
      }
    }
    return { success: true, table: "invoices", action: "update_invoice", data, lines: savedLines };
  },

  async archiveInvoice(id, context = {}) {
    return this.updateInvoice(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, null, context);
  },

  async reactivateInvoice(id, context = {}) {
    return this.updateInvoice(id, {
      status: "draft",
      deleted_at: null,
    }, null, context);
  },

  async markInvoicePaid(id, context = {}) {
    return this.updateInvoice(id, {
      status: "paid",
      payment_status: "paid",
      paid_at: new Date().toISOString(),
    }, null, context);
  },

  async markInvoiceSent(id, context = {}) {
    return this.updateInvoice(id, {
      status: "sent",
      payment_status: "sent",
    }, null, context);
  },

  async markInvoiceExpired(id, context = {}) {
    return this.updateInvoice(id, {
      status: "expired",
      payment_status: "expired",
    }, null, context);
  },

  async createSubscription(record = {}, context = {}) {
    assertSubscriptionWriteTable("subscriptions");
    const client = await getSubscriptionWriteClient(context);
    const payload = {
      ...record,
      updated_at: record.updated_at || new Date().toISOString(),
      created_at: record.created_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("subscriptions").insert(payload).select("*").single();
    if (error) throw new Error(error.message || "Abonnement aanmaken in Supabase is mislukt.");
    return { success: true, table: "subscriptions", action: "create_subscription", data };
  },

  async updateSubscription(id, updates = {}, context = {}) {
    assertSubscriptionWriteTable("subscriptions");
    const client = await getSubscriptionWriteClient(context);
    const payload = {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    const { data, error } = await client.from("subscriptions").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(error.message || "Abonnement bijwerken in Supabase is mislukt.");
    return { success: true, table: "subscriptions", action: "update_subscription", data };
  },

  async pauseSubscription(id, context = {}) {
    return this.updateSubscription(id, {
      status: "paused",
    }, context);
  },

  async cancelSubscription(id, context = {}) {
    return this.updateSubscription(id, {
      status: "cancelled",
      end_date: new Date().toISOString().slice(0, 10),
    }, context);
  },

  async reactivateSubscription(id, context = {}) {
    return this.updateSubscription(id, {
      status: "active",
      end_date: null,
      deleted_at: null,
    }, context);
  },

  async archiveSubscription(id, context = {}) {
    return this.updateSubscription(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    }, context);
  },

  setAll() {
    return writeBlocked();
  },

  async count(table) {
    if (!isProfilesTable(table) && !isCustomersTable(table) && !isWebsitesTable(table) && !isProjectsTable(table) && !isQuotesTable(table) && !isQuoteLinesTable(table) && !isInvoicesTable(table) && !isInvoiceLinesTable(table) && !isSubscriptionsTable(table)) {
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
