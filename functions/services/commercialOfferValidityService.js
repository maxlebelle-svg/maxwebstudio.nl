const TIME_ZONE = "Europe/Amsterdam";
const DEFAULT_VALIDITY_DAYS = 14;

function defaultValidityDate(now = new Date()) {
  return addCalendarDays(dateInTimeZone(now), DEFAULT_VALIDITY_DAYS);
}

function dateInTimeZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(value, days) {
  const valid = normalizeValidityDate(value);
  if (!valid || !Number.isInteger(days)) return "";
  const date = new Date(`${valid}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeValidityDate(value) {
  const result = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return "";
  const parsed = new Date(`${result}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : "";
}

function expiryIso(value) {
  const valid = normalizeValidityDate(value);
  if (!valid) return "";
  const nextDate = addCalendarDays(valid, 1);
  const [year, month, day] = nextDate.split("-").map(Number);
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    guess -= represented - Date.UTC(year, month - 1, day, 0, 0, 0);
  }
  return new Date(guess - 1).toISOString();
}

function isExpired(value, now = new Date()) {
  const expiry = expiryIso(value);
  return !expiry || new Date(expiry).getTime() <= now.getTime();
}

function formatValidityDate(value) {
  const valid = normalizeValidityDate(value);
  if (!valid) return "";
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${valid}T12:00:00.000Z`));
}

module.exports = {
  TIME_ZONE,
  DEFAULT_VALIDITY_DAYS,
  defaultValidityDate,
  normalizeValidityDate,
  expiryIso,
  isExpired,
  formatValidityDate,
  _private: { dateInTimeZone, addCalendarDays },
};
