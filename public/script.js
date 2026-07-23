const portfolioTrustContent = {
  featuredCase: {
    client: "Quantumbouw.nl",
    category: "Bouwbedrijf",
    status: "Website live",
    description: "Professionele bedrijfswebsite ontworpen en gebouwd met focus op snelheid, vertrouwen en leadgeneratie.",
    websiteUrl: "https://quantumbouw.nl",
    projectUrl: "portfolio/bouw.html",
  },
  customerCases: [
    {
      client: "Quantumbouw.nl",
      category: "Bouwbedrijf",
      status: "Website live",
      description: "Professionele bedrijfswebsite ontworpen en gebouwd met focus op snelheid, vertrouwen en leadgeneratie.",
      websiteUrl: "https://quantumbouw.nl",
      projectUrl: "portfolio/bouw.html",
    },
  ],
  statistics: [
    {
      label: "Eerste website live",
      value: "Quantumbouw.nl",
      detail: "Klantcase gepubliceerd",
    },
    {
      label: "Gemiddelde oplevering",
      value: "5 werkdagen",
      detail: "Van intake tot livegang",
    },
    {
      label: "Persoonlijk contact",
      value: "1 vast aanspreekpunt",
      detail: "Direct schakelen met Max",
    },
    {
      label: "Branches voorbereid",
      value: "20+",
      detail: "Demo's en sectorflows",
    },
  ],
  benefits: [
    {
      eyebrow: "Snelheid",
      title: "Razendsnelle oplevering",
      description: "Wij bouwen de meeste websites binnen enkele werkdagen, zonder in te leveren op uitstraling of structuur.",
    },
    {
      eyebrow: "Maatwerk",
      title: "Volledig afgestemd",
      description: "Geen standaard template, maar een website die past bij jouw bedrijf, doelgroep en manier van werken.",
    },
    {
      eyebrow: "Begeleiding",
      title: "Eén aanspreekpunt",
      description: "Direct contact met dezelfde specialist tijdens strategie, ontwerp, bouw, livegang en onderhoud.",
    },
  ],
};

function renderPortfolioTrustSection() {
  const statisticsTarget = document.querySelector("[data-trust-statistics]");
  const featuredCaseTarget = document.querySelector("[data-featured-case]");
  const benefitsTarget = document.querySelector("[data-trust-benefits]");

  if (!statisticsTarget || !featuredCaseTarget || !benefitsTarget) {
    return;
  }

  const { statistics, benefits, customerCases } = portfolioTrustContent;
  const featuredCase = portfolioTrustContent.featuredCase || customerCases[0];

  if (!featuredCase) {
    return;
  }

  statisticsTarget.innerHTML = statistics
    .map(
      (statistic) => `
        <article class="proof-metric-card reveal-on-scroll">
          <span class="proof-metric-label">${statistic.label}</span>
          <strong>${statistic.value}</strong>
          <small>${statistic.detail}</small>
        </article>
      `,
    )
    .join("");

  featuredCaseTarget.innerHTML = `
    <article class="featured-case-card reveal-on-scroll">
      <div class="featured-case-visual" aria-hidden="true">
        <div class="featured-case-browser">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="featured-case-preview">
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
      <div class="featured-case-content">
        <span class="featured-case-status">${featuredCase.status}</span>
        <h3>${featuredCase.client}</h3>
        <dl class="featured-case-meta">
          <div>
            <dt>Client</dt>
            <dd>${featuredCase.client}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>${featuredCase.category}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>${featuredCase.status}</dd>
          </div>
        </dl>
        <p>${featuredCase.description}</p>
        <div class="featured-case-actions">
          <a class="button primary" href="${featuredCase.websiteUrl}" target="_blank" rel="noopener">Bekijk website</a>
          <a class="button secondary" href="${featuredCase.projectUrl}">Bekijk project</a>
        </div>
      </div>
    </article>
  `;

  benefitsTarget.innerHTML = benefits
    .map(
      (benefit, index) => `
        <article class="trust-benefit-card reveal-on-scroll">
          <span class="trust-benefit-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <p>${benefit.eyebrow}</p>
            <h4>${benefit.title}</h4>
            <span>${benefit.description}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

renderPortfolioTrustSection();

const packageSelect = document.querySelector("#package-select");
const carePackageSelect = document.querySelector("#care-package-select");
const packageLinks = document.querySelectorAll("[data-package]");
const carePackageLinks = document.querySelectorAll("[data-care-package]");
const formButton = document.querySelector(".lead-form button");
const form = document.querySelector(".lead-form");
const formStatus = document.querySelector("#lead-form-status");
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
const demoFilterButtons = document.querySelectorAll("[data-demo-filter]");
const demoCards = document.querySelectorAll("[data-demo-card]");
const demoCarousel = document.querySelector("[data-demo-grid]");
const demoPrev = document.querySelector("[data-demo-prev]");
const demoNext = document.querySelector("[data-demo-next]");
const demoDots = document.querySelector("[data-demo-dots]");
const reviewCarousel = document.querySelector("[data-review-grid]");
const reviewCards = document.querySelectorAll("[data-review-card]");
const reviewPrev = document.querySelector("[data-review-prev]");
const reviewNext = document.querySelector("[data-review-next]");
const reviewDots = document.querySelector("[data-review-dots]");
const maxAiHelper = document.querySelector("[data-max-ai-helper]");
const maxAiLauncher = document.querySelector("[data-max-ai-launcher]");
const maxAiDismissButtons = document.querySelectorAll("[data-max-ai-dismiss]");
const maxAiPrimaryAction = document.querySelector("[data-max-ai-primary-action]");
const maxAiSpeech = document.querySelector("[data-max-ai-speech]");
const cookieConsent = document.querySelector("[data-cookie-consent]");
const cookieAnalyticsInput = document.querySelector("[data-cookie-analytics]");
const cookieAcceptAllButton = document.querySelector("[data-cookie-accept-all]");
const cookieNecessaryButton = document.querySelector("[data-cookie-necessary]");
const cookieSaveButton = document.querySelector("[data-cookie-save]");
const cookieSettingsButtons = document.querySelectorAll("[data-cookie-settings]");

const calendlyUrl = "https://calendly.com/maxwebstudio/gratis-kennismakingsgesprek";
const googleAnalyticsMeasurementId = "G-7BQ266CT0C";
const googleAnalyticsScriptId = "maxwebstudio-google-analytics";
const leadStorageKey = "maxwebstudioLeadRequests";
const maxAiHelperDismissedKey = "maxwebstudioMaxAiHelperDismissed";
const cookieConsentStorageKey = "maxwebstudioCookieConsent";
const maxAiStates = ["idle", "wave", "thumbs-up", "thinking", "celebrate", "look", "blink", "error-safe"];
let calendlyLoadPromise;
let maxAiStateTimer;
let googleAnalyticsLoaded = false;
let pendingLeadRequest = null;

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

const demoFilterTargets = {
  all: "bouw",
  bouw: "bouw",
  horeca: "horeca",
  coaching: "coaching",
  dienstverlening: "dienstverlening",
  zorg: "zorg",
  automotive: "automotive",
  vastgoed: "vastgoed",
  ecommerce: "ecommerce",
};

let activeDemoIndex = 0;

function setActiveDemo(index) {
  if (!demoCards.length) {
    return;
  }

  activeDemoIndex = Math.max(0, Math.min(index, demoCards.length - 1));

  demoCards.forEach((card, cardIndex) => {
    card.classList.toggle("active", cardIndex === activeDemoIndex);
  });

  demoDots?.querySelectorAll("button").forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === activeDemoIndex);
  });

  const activeCard = demoCards[activeDemoIndex];
  const activeKey = activeCard?.dataset.demoKey;

  demoFilterButtons.forEach((button) => {
    const targetKey = demoFilterTargets[button.dataset.demoFilter || "all"];
    button.classList.toggle("active", targetKey === activeKey || (button.dataset.demoFilter === "all" && activeDemoIndex === 0));
  });
}

function scrollToDemo(index) {
  const targetCard = demoCards[index];

  if (!targetCard) {
    return;
  }

  targetCard.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  setActiveDemo(index);
}

function getNearestDemoIndex() {
  if (!demoCarousel || !demoCards.length) {
    return 0;
  }

  const carouselLeft = demoCarousel.getBoundingClientRect().left;
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  demoCards.forEach((card, index) => {
    const distance = Math.abs(card.getBoundingClientRect().left - carouselLeft);

    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  return nearestIndex;
}

demoFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetKey = demoFilterTargets[button.dataset.demoFilter || "all"] || "bouw";
    const targetIndex = [...demoCards].findIndex((card) => card.dataset.demoKey === targetKey);

    scrollToDemo(targetIndex >= 0 ? targetIndex : 0);
  });
});

demoCards.forEach((card, index) => {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.setAttribute("aria-label", `Ga naar demo ${index + 1}`);
  dot.addEventListener("click", () => scrollToDemo(index));
  demoDots?.appendChild(dot);
});

demoPrev?.addEventListener("click", () => {
  scrollToDemo(activeDemoIndex <= 0 ? demoCards.length - 1 : activeDemoIndex - 1);
});

demoNext?.addEventListener("click", () => {
  scrollToDemo(activeDemoIndex >= demoCards.length - 1 ? 0 : activeDemoIndex + 1);
});

demoCarousel?.addEventListener("scroll", () => {
  window.requestAnimationFrame(() => setActiveDemo(getNearestDemoIndex()));
});

demoCarousel?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    scrollToDemo(activeDemoIndex <= 0 ? demoCards.length - 1 : activeDemoIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    scrollToDemo(activeDemoIndex >= demoCards.length - 1 ? 0 : activeDemoIndex + 1);
  }
});

setActiveDemo(0);

let activeReviewIndex = 0;

function setActiveReview(index) {
  if (!reviewCards.length) {
    return;
  }

  activeReviewIndex = Math.max(0, Math.min(index, reviewCards.length - 1));

  reviewCards.forEach((card, cardIndex) => {
    card.classList.toggle("active", cardIndex === activeReviewIndex);
  });

  reviewDots?.querySelectorAll("button").forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === activeReviewIndex);
  });
}

function scrollToReview(index) {
  const targetCard = reviewCards[index];

  if (!targetCard) {
    return;
  }

  targetCard.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  setActiveReview(index);
}

function getNearestReviewIndex() {
  if (!reviewCarousel || !reviewCards.length) {
    return 0;
  }

  const carouselLeft = reviewCarousel.getBoundingClientRect().left;
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  reviewCards.forEach((card, index) => {
    const distance = Math.abs(card.getBoundingClientRect().left - carouselLeft);

    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  return nearestIndex;
}

reviewCards.forEach((card, index) => {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.setAttribute("aria-label", `Ga naar review ${index + 1}`);
  dot.addEventListener("click", () => scrollToReview(index));
  reviewDots?.appendChild(dot);
});

reviewPrev?.addEventListener("click", () => {
  scrollToReview(activeReviewIndex <= 0 ? reviewCards.length - 1 : activeReviewIndex - 1);
});

reviewNext?.addEventListener("click", () => {
  scrollToReview(activeReviewIndex >= reviewCards.length - 1 ? 0 : activeReviewIndex + 1);
});

reviewCarousel?.addEventListener("scroll", () => {
  window.requestAnimationFrame(() => setActiveReview(getNearestReviewIndex()));
});

reviewCarousel?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    scrollToReview(activeReviewIndex <= 0 ? reviewCards.length - 1 : activeReviewIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    scrollToReview(activeReviewIndex >= reviewCards.length - 1 ? 0 : activeReviewIndex + 1);
  }
});

setActiveReview(0);

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

function setMaxAiHelperState(state) {
  if (!maxAiHelper || !maxAiLauncher) {
    return;
  }

  const isMinimized = state === "minimized";
  maxAiHelper.hidden = isMinimized;
  maxAiLauncher.hidden = !isMinimized;

  try {
    localStorage.setItem(maxAiHelperDismissedKey, isMinimized ? "minimized" : "open");
  } catch (error) {
    // localStorage can be unavailable in strict privacy modes.
  }

  syncMaxAiMobileLauncherVisibility();
}

function isCompactMaxAiViewport() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function syncMaxAiMobileLauncherVisibility() {
  if (!maxAiHelper || !maxAiLauncher) {
    return;
  }

  const deferLauncher = isCompactMaxAiViewport() && maxAiHelper.hidden && window.scrollY < 520;
  maxAiLauncher.dataset.mobileDeferred = deferLauncher ? "true" : "false";
}

function setMaxAiState(state) {
  if (!maxAiHelper || !maxAiStates.includes(state)) {
    return;
  }

  maxAiHelper.dataset.maxState = state;
}

function restoreMaxAiIdle() {
  if (maxAiStateTimer) {
    window.clearTimeout(maxAiStateTimer);
    maxAiStateTimer = null;
  }

  setMaxAiState("idle");

  if (maxAiSpeech) {
    maxAiSpeech.hidden = true;
    maxAiSpeech.textContent = "";
  }
}

function playMaxAiState(state, duration = 1400) {
  if (!maxAiStates.includes(state)) {
    return;
  }

  if (maxAiStateTimer) {
    window.clearTimeout(maxAiStateTimer);
  }

  setMaxAiState(state);
  maxAiStateTimer = window.setTimeout(restoreMaxAiIdle, duration);
}

function celebrateMaxAi(message = "Gefeliciteerd!") {
  if (maxAiSpeech) {
    maxAiSpeech.textContent = message;
    maxAiSpeech.hidden = false;
  }

  playMaxAiState("celebrate", 2400);
}

window.maxWebstudioMaxAi = {
  setState: setMaxAiState,
  playState: playMaxAiState,
  restoreIdle: restoreMaxAiIdle,
  celebrate: celebrateMaxAi,
};

try {
  const savedMaxAiHelperState = localStorage.getItem(maxAiHelperDismissedKey);

  if (isCompactMaxAiViewport() || savedMaxAiHelperState === "true" || savedMaxAiHelperState === "minimized") {
    setMaxAiHelperState("minimized");
  } else {
    setMaxAiHelperState("open");
  }
} catch (error) {
  // Keep the helper visible when localStorage cannot be read.
}

syncMaxAiMobileLauncherVisibility();
window.addEventListener("scroll", syncMaxAiMobileLauncherVisibility, { passive: true });
window.addEventListener("resize", syncMaxAiMobileLauncherVisibility);

maxAiDismissButtons.forEach((button) => {
  button.addEventListener("click", () => setMaxAiHelperState("minimized"));
});

maxAiLauncher?.addEventListener("click", () => {
  setMaxAiHelperState("open");
  playMaxAiState("wave", 1500);
});

maxAiPrimaryAction?.addEventListener("mouseenter", () => playMaxAiState("thumbs-up", 1100));
maxAiPrimaryAction?.addEventListener("focus", () => playMaxAiState("thumbs-up", 1100));
maxAiPrimaryAction?.addEventListener("click", () => playMaxAiState("thinking", 900));

window.setTimeout(() => {
  if (maxAiHelper && !maxAiHelper.hidden) {
    playMaxAiState("wave", 1600);
  }
}, 900);

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

function setLeadFormStatus(message, type = "") {
  if (!formStatus) {
    return;
  }

  formStatus.textContent = message;
  formStatus.classList.toggle("success", type === "success");
  formStatus.classList.toggle("error", type === "error");
}

function markLeadField(field, hasError) {
  field?.classList.toggle("form-error", hasError);
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
  const body = JSON.stringify(lead);
  if (new TextEncoder().encode(body).length > 131072) {
    const error = new Error("De aanvraag is te groot.");
    error.statusCode = 413;
    throw error;
  }
  const response = await fetch("/.netlify/functions/send-lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = new Error(data.error || "Aanvraag kon niet veilig worden opgeslagen.");
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

async function handleLeadFormSubmit() {
  if (!form) {
    return;
  }

  const formData = new FormData(form);
  const nameField = form.querySelector('[name="name"]');
  const emailField = form.querySelector('[name="email"]');
  const companyField = form.querySelector('[name="company"]');
  const phoneField = form.querySelector('[name="phone"]');
  const messageField = form.querySelector('[name="message"]');
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const selectedPackage = formData.get("package") || "Business Launch";
  const selectedCarePackage = formData.get("carePackage") || "Nog geen keuze";
  const validation = window.MaxWebstudioLeadValidation.validateLeadDraft({
    name,
    company,
    email,
    phone,
    message,
    source: "homepage-contact-form",
    requestId: "lead-0000000000000",
    packageInterest: String(selectedPackage),
    carePackage: String(selectedCarePackage),
    termsAccepted: Boolean(termsAccepted?.checked),
  });

  markLeadField(nameField, Boolean(validation.errors.name));
  markLeadField(companyField, Boolean(validation.errors.company));
  markLeadField(emailField, Boolean(validation.errors.email));
  markLeadField(phoneField, Boolean(validation.errors.phone));
  markLeadField(messageField, Boolean(validation.errors.message));

  if (!validation.valid && !validation.errors.termsAccepted) {
    setLeadFormStatus("Controleer je naam, bedrijfsnaam, e-mailadres, telefoonnummer en bericht.", "error");
    formButton.setAttribute("aria-live", "polite");
    return;
  }

  if (validation.errors.termsAccepted) {
    setLeadFormStatus("Akkoord met de voorwaarden is nodig om je aanvraag te versturen.", "error");
    formButton.setAttribute("aria-live", "polite");
    return;
  }

  const leadRequest = pendingLeadRequest || window.MaxWebstudioLeadValidation.buildLeadRequestWithHoneypot(formData, {
    id: `lead-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: "homepage-contact-form",
    status: "nieuw",
    name,
    company,
    email,
    phone,
    packageInterest: String(selectedPackage),
    carePackage: String(selectedCarePackage),
    termsAccepted: true,
    message,
  });
  pendingLeadRequest = leadRequest;

  try {
    if (formButton) {
      formButton.textContent = "Aanvraag verzenden...";
      formButton.disabled = true;
      formButton.setAttribute("aria-live", "polite");
    }
    setLeadFormStatus("Aanvraag verzenden...", "");

    const intakeResult = await sendLeadRequest(leadRequest);
    if (intakeResult.accepted !== false) storeLeadRequest(leadRequest);
    pendingLeadRequest = null;
    form.reset();
    if (formButton) {
      formButton.textContent = "Aanvraag verzonden";
      formButton.disabled = false;
    }
    setLeadFormStatus("Bedankt! Je aanvraag is succesvol verzonden. Ik neem meestal dezelfde dag contact met je op.", "success");
  } catch (error) {
    console.warn("Lead intake failed", error);
    if (formButton) {
      formButton.textContent = "Verstuur aanvraag";
      formButton.disabled = false;
    }
    setLeadFormStatus(error.statusCode === 429
      ? "Er zijn te veel aanvragen vanaf deze verbinding. Probeer het later opnieuw."
      : "Je aanvraag kon niet veilig worden opgeslagen. Probeer het opnieuw of neem contact op via WhatsApp.", "error");
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLeadFormSubmit();
});

form?.addEventListener("input", () => {
  pendingLeadRequest = null;
});

formButton?.addEventListener("click", () => {
  handleLeadFormSubmit();
});

function readCookieConsent() {
  try {
    const storedConsent = localStorage.getItem(cookieConsentStorageKey);

    if (!storedConsent) {
      return null;
    }

    const parsedConsent = JSON.parse(storedConsent);

    return {
      necessary: true,
      analytics: Boolean(parsedConsent.analytics),
      version: Number(parsedConsent.version) || 1,
      updatedAt: parsedConsent.updatedAt || null,
    };
  } catch (error) {
    return null;
  }
}

function setCookieConsentControls(consent) {
  if (!cookieAnalyticsInput) {
    return;
  }

  cookieAnalyticsInput.checked = Boolean(consent?.analytics);
}

function disableGoogleAnalytics() {
  window[`ga-disable-${googleAnalyticsMeasurementId}`] = true;
}

function loadGoogleAnalytics() {
  if (googleAnalyticsLoaded || document.getElementById(googleAnalyticsScriptId)) {
    googleAnalyticsLoaded = true;
    return;
  }

  window[`ga-disable-${googleAnalyticsMeasurementId}`] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", googleAnalyticsMeasurementId, {
    anonymize_ip: true,
  });

  const analyticsScript = document.createElement("script");
  analyticsScript.id = googleAnalyticsScriptId;
  analyticsScript.async = true;
  analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsMeasurementId}`;
  document.head.appendChild(analyticsScript);
  googleAnalyticsLoaded = true;
}

function applyCookieConsent(consent) {
  if (consent?.analytics) {
    loadGoogleAnalytics();
    return;
  }

  disableGoogleAnalytics();
}

function showCookieConsent() {
  if (!cookieConsent) {
    return;
  }

  setCookieConsentControls(readCookieConsent());
  cookieConsent.dataset.preferencesOpen = "false";
  if (cookieSaveButton) {
    cookieSaveButton.textContent = "Voorkeuren";
  }
  cookieConsent.hidden = false;
  document.body.dataset.cookieConsentVisible = "true";
}

function hideCookieConsent() {
  if (!cookieConsent) {
    return;
  }

  cookieConsent.hidden = true;
  delete document.body.dataset.cookieConsentVisible;
}

function storeCookieConsent(analyticsAllowed) {
  const consent = {
    necessary: true,
    analytics: Boolean(analyticsAllowed),
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(cookieConsentStorageKey, JSON.stringify(consent));
  } catch (error) {
    // Consent can still be honored for this page view when localStorage is blocked.
  }

  window.dispatchEvent(new CustomEvent("maxwebstudio:cookie-consent", { detail: consent }));
  applyCookieConsent(consent);
  setCookieConsentControls(consent);
  hideCookieConsent();
}

if (cookieConsent) {
  const savedCookieConsent = readCookieConsent();

  if (!savedCookieConsent) {
    disableGoogleAnalytics();
    showCookieConsent();
  } else {
    applyCookieConsent(savedCookieConsent);
    setCookieConsentControls(savedCookieConsent);
  }
}

cookieAcceptAllButton?.addEventListener("click", () => {
  storeCookieConsent(true);
});

cookieNecessaryButton?.addEventListener("click", () => {
  storeCookieConsent(false);
});

cookieSaveButton?.addEventListener("click", () => {
  if (cookieConsent?.dataset.preferencesOpen !== "true") {
    if (cookieConsent) {
      cookieConsent.dataset.preferencesOpen = "true";
    }
    cookieSaveButton.textContent = "Voorkeuren opslaan";
    cookieAnalyticsInput?.focus();
    return;
  }

  storeCookieConsent(Boolean(cookieAnalyticsInput?.checked));
});

cookieSettingsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showCookieConsent();
  });
});
