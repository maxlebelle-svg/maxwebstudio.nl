const fs = require("fs");
const path = require("path");

const intakeFile = path.join("/tmp", "maxwebstudio-intakes.json");

async function saveIntake(intake) {
  const intakes = await readIntakes();
  intakes.unshift(intake);

  // TODO: Replace file/tmp storage with Supabase, Postgres or Netlify Blobs for durable production storage.
  await fs.promises.writeFile(intakeFile, JSON.stringify(intakes.slice(0, 100), null, 2), "utf8");
  console.log("Project intake stored", {
    id: intake.id,
    companyName: intake.companyName,
    email: intake.email,
    createdAt: intake.createdAt,
  });

  return intake;
}

async function readIntakes() {
  try {
    const content = await fs.promises.readFile(intakeFile, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

module.exports = { saveIntake, readIntakes };
