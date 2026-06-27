const packageSelect = document.querySelector("#package-select");
const carePackageSelect = document.querySelector("#care-package-select");
const packageLinks = document.querySelectorAll("[data-package]");
const carePackageLinks = document.querySelectorAll("[data-care-package]");
const formButton = document.querySelector(".lead-form button");
const form = document.querySelector(".lead-form");
const termsAccepted = document.querySelector("#terms-accepted");
const checkoutOptions = document.querySelectorAll("[data-checkout-package]");
const checkoutTitle = document.querySelector("#checkout-title");
const checkoutDeposit = document.querySelector("#checkout-deposit");
const checkoutLink = document.querySelector("#checkout-link");
const caseSlider = document.querySelector("[data-case-slider]");
const caseSlides = document.querySelectorAll(".case-slide");
const caseDots = document.querySelectorAll("[data-case-dot]");
const casePrev = document.querySelector("[data-case-prev]");
const caseNext = document.querySelector("[data-case-next]");
const calendlyTriggers = document.querySelectorAll("[data-calendly-open]");
const revealItems = document.querySelectorAll(".reveal-on-scroll");

const calendlyUrl = "https://calendly.com/maxwebstudio/gratis-kennismakingsgesprek";
const leadStorageKey = "maxwebstudioLeadRequests";
let calendlyLoadPromise;

const checkoutPackages = {
  "Starter Site": {
    deposit: "€150",
    paymentUrl: "betalen.html?website=starter_site",
  },
  "Business Website": {
    deposit: "€300",
    paymentUrl: "betalen.html?website=business_website",
  },
  "Premium Growth": {
    deposit: "€500",
    paymentUrl: "betalen.html?website=premium_growth",
  },
};

function selectPackage(packageName) {
  if (packageSelect) {
    packageSelect.value = packageName;
  }

  checkoutOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.checkoutPackage === packageName);
  });

  const checkoutPackage = checkoutPackages[packageName];

  if (!checkoutPackage || !checkoutTitle || !checkoutDeposit || !checkoutLink) {
    return;
  }

  checkoutTitle.textContent = packageName;
  checkoutDeposit.textContent = checkoutPackage.deposit;

  checkoutLink.href = checkoutPackage.paymentUrl;
  checkoutLink.textContent = `Betaal ${checkoutPackage.deposit} via Mollie`;
  checkoutLink.classList.remove("disabled-payment");
  checkoutLink.removeAttribute("target");
  checkoutLink.removeAttribute("rel");
}

packageLinks.forEach((link) => {
  link.addEventListener("click", () => {
    selectPackage(link.dataset.package);
  });
});

carePackageLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (carePackageSelect) {
      carePackageSelect.value = link.dataset.carePackage;
    }
  });
});

checkoutOptions.forEach((option) => {
  option.addEventListener("click", () => {
    selectPackage(option.dataset.checkoutPackage);
  });
});

let activeCase = 0;
let touchStartX = 0;

function showCase(index) {
  if (!caseSlides.length) {
    return;
  }

  activeCase = (index + caseSlides.length) % caseSlides.length;

  caseSlides.forEach((slide, slideIndex) => {
    slide.classList.toggle("active", slideIndex === activeCase);
  });

  caseDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === activeCase);
  });
}

casePrev?.addEventListener("click", () => showCase(activeCase - 1));
caseNext?.addEventListener("click", () => showCase(activeCase + 1));

caseDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    showCase(Number(dot.dataset.caseDot));
  });
});

caseSlider?.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
});

caseSlider?.addEventListener("touchend", (event) => {
  const distance = event.changedTouches[0].clientX - touchStartX;

  if (Math.abs(distance) < 40) {
    return;
  }

  showCase(distance < 0 ? activeCase + 1 : activeCase - 1);
});

function loadCalendlyWidget() {
  if (window.Calendly) {
    return Promise.resolve();
  }

  if (calendlyLoadPromise) {
    return calendlyLoadPromise;
  }

  calendlyLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector("[data-calendly-css]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://assets.calendly.com/assets/external/widget.css";
      link.dataset.calendlyCss = "true";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return calendlyLoadPromise;
}

async function openCalendlyPopup() {
  try {
    await loadCalendlyWidget();
    window.Calendly.initPopupWidget({ url: calendlyUrl });
  } catch (error) {
    window.open(calendlyUrl, "_blank", "noopener");
  }
}

calendlyTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openCalendlyPopup();
  });
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.18 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

function storeLeadRequest(lead) {
  let currentLeads = [];

  try {
    currentLeads = JSON.parse(localStorage.getItem(leadStorageKey) || "[]");
  } catch (error) {
    currentLeads = [];
  }

  if (!Array.isArray(currentLeads)) {
    currentLeads = [];
  }

  currentLeads.unshift(lead);
  localStorage.setItem(leadStorageKey, JSON.stringify(currentLeads.slice(0, 50)));
}

async function sendLeadRequest(lead) {
  const response = await fetch("/.netlify/functions/send-lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(lead),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(data.error || "E-mail verzenden lukte niet.");
  }

  return data;
}

async function handleLeadFormSubmit() {
  if (termsAccepted && !termsAccepted.checked) {
    formButton.textContent = "Akkoord met voorwaarden is nodig";
    formButton.setAttribute("aria-live", "polite");
    return;
  }

  const formData = new FormData(form);
  const name = formData.get("name") || "nieuwe klant";
  const selectedPackage = formData.get("package") || "Business Launch";
  const selectedCarePackage = formData.get("carePackage") || "Nog geen keuze";

  const leadRequest = {
    id: `lead-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: "homepage-contact-form",
    status: "nieuw",
    name: String(name).trim(),
    email: String(formData.get("email") || "").trim(),
    packageInterest: String(selectedPackage),
    carePackage: String(selectedCarePackage),
    termsAccepted: true,
    message: String(formData.get("message") || "").trim(),
  };

  try {
    storeLeadRequest(leadRequest);
    formButton.textContent = "Aanvraag verzenden...";
    formButton.disabled = true;
    formButton.setAttribute("aria-live", "polite");

    await sendLeadRequest(leadRequest);
    form.reset();
    formButton.textContent = "Aanvraag verzonden";
    formButton.disabled = false;
  } catch (error) {
    console.error("Lead request email failed", error);
    formButton.textContent = "Probeer opnieuw of stuur WhatsApp";
    formButton.disabled = false;
    formButton.setAttribute("aria-live", "polite");
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLeadFormSubmit();
});

formButton?.addEventListener("click", () => {
  handleLeadFormSubmit();
});
