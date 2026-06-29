const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const calculator = document.querySelector("[data-calculator]");
const calculatorResult = document.querySelector("[data-calculator-result]");
const adviceForm = document.querySelector("[data-advice-form]");
const formMessage = document.querySelector("[data-form-message]");
const newsletterForm = document.querySelector("[data-newsletter-form]");
const revealItems = document.querySelectorAll(".reveal");

function syncHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  header?.classList.remove("is-open");
  mobileNav?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

function formatEuro(value) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateSavings(form) {
  const formData = new FormData(form);
  const usage = Number(formData.get("usage") || 0);
  const panels = Number(formData.get("panels") || 0);
  const hasCar = formData.get("car") === "yes";
  const hasPump = formData.get("pump") === "yes";
  const yearlyProduction = panels * 365;
  const extraDemand = (hasCar ? 1800 : 0) + (hasPump ? 2600 : 0);
  const effectiveUsage = usage + extraDemand;
  const ownUse = Math.min(yearlyProduction * (hasCar || hasPump ? 0.72 : 0.58), effectiveUsage);
  const savings = Math.max(420, ownUse * 0.29);
  const batteryAdvice = yearlyProduction > usage * 0.85 || hasCar || hasPump;

  return {
    production: Math.round(yearlyProduction),
    ownUse: Math.round(ownUse),
    savings: Math.round(savings),
    batteryAdvice,
  };
}

function renderCalculatorResult(result) {
  if (!calculatorResult) return;
  calculatorResult.innerHTML = `
    <strong>${formatEuro(result.savings)} per jaar</strong>
    <span>Geschatte besparing op basis van ${result.production.toLocaleString("nl-NL")} kWh zonne-opwek en ${result.ownUse.toLocaleString("nl-NL")} kWh eigen verbruik.</span>
    <span>${result.batteryAdvice ? "Thuisbatterijadvies: interessant om verder te bekijken." : "Thuisbatterijadvies: optioneel, afhankelijk van toekomstig verbruik."}</span>
  `;
}

menuToggle?.addEventListener("click", () => {
  const isOpen = mobileNav?.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", Boolean(isOpen));
  header?.classList.toggle("is-open", Boolean(isOpen));
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

calculator?.addEventListener("submit", (event) => {
  event.preventDefault();
  renderCalculatorResult(calculateSavings(calculator));
});

adviceForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(adviceForm);
  const requiredFields = ["name", "email", "phone", "postcode", "homeType", "interest", "message"];
  const missingField = requiredFields.some((field) => !String(formData.get(field) || "").trim());

  if (missingField) {
    formMessage.textContent = "Vul de verplichte velden in, dan kunnen we je adviesaanvraag goed beoordelen.";
    return;
  }

  adviceForm.reset();
  formMessage.textContent = "Bedankt! Je adviesaanvraag is ontvangen. Een energieadviseur neemt persoonlijk contact met je op.";
});

newsletterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  newsletterForm.reset();
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

if (calculator) {
  renderCalculatorResult(calculateSavings(calculator));
}
