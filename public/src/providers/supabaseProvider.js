function notActive() {
  console.info("Supabase provider voorbereid, nog niet actief.");
  return "Supabase provider voorbereid, nog niet actief.";
}

export const supabaseProvider = {
  type: "supabase",
  status: "prepared",

  getAll() {
    notActive();
    return [];
  },
  getById() {
    notActive();
    return null;
  },
  create() {
    throw new Error(notActive());
  },
  update() {
    throw new Error(notActive());
  },
  delete() {
    throw new Error(notActive());
  },
  setAll() {
    throw new Error(notActive());
  },
  count() {
    notActive();
    return 0;
  },
};
