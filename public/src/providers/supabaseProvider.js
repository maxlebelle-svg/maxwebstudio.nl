import { getSupabaseClientStatus } from "./supabaseClient.js";

function preparedMessage(table = "") {
  const status = getSupabaseClientStatus();
  const suffix = table ? ` Tabel ${table} blijft dry-run/no-op in deze fase.` : "";
  if (!status.configured) return `Supabase niet geconfigureerd. Vul SUPABASE_URL en SUPABASE_ANON_KEY veilig in via environment variables.${suffix}`;
  return `Supabase voorbereid, live queries komen in een gecontroleerde vervolgfase.${suffix}`;
}

function isCustomersTable(table) {
  return table === "customers" || table === "maxwebstudioCrmCustomers" || table === "maxwebstudioCustomers";
}

function readNotActive(table) {
  console.info(preparedMessage(isCustomersTable(table) ? "customers" : table));
  return [];
}

function writeNotActive(table) {
  throw new Error(preparedMessage(isCustomersTable(table) ? "customers" : table));
}

function customerWriteBlocked() {
  const status = getSupabaseClientStatus();
  if (!status.configured) {
    throw new Error("Supabase niet geconfigureerd. CRM live migratie blijft geblokkeerd.");
  }
  if (!status.clientPackageAvailable || !status.customerWritesEnabled) {
    throw new Error("Supabase client package nog niet actief; live migratie blijft geblokkeerd.");
  }
  throw new Error("Supabase customers write is voorbereid, maar nog niet vrijgegeven.");
}

export const supabaseProvider = {
  type: "supabase-prepared",
  status: "prepared",

  getAll(table) {
    return readNotActive(table);
  },
  getById(table) {
    console.info(preparedMessage(table));
    return null;
  },
  create(table) {
    if (isCustomersTable(table)) return customerWriteBlocked();
    return writeNotActive(table);
  },
  update(table) {
    if (isCustomersTable(table)) return customerWriteBlocked();
    return writeNotActive(table);
  },
  delete(table) {
    return writeNotActive(table);
  },
  setAll(table) {
    return writeNotActive(table);
  },
  count(table) {
    console.info(preparedMessage(isCustomersTable(table) ? "customers" : table));
    return 0;
  },
  getStatus() {
    return getSupabaseClientStatus();
  },
};
