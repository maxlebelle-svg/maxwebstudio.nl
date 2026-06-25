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
let calendlyLoadPromise;

const checkoutPackages = {
  "Starter Site": {
    deposit: "€150",
    paymentUrl: "",
  },
  "Business Website": {
    deposit: "€300",
    paymentUrl: "",
  },
  "Premium Growth": {
    deposit: "€500",
    paymentUrl: "",
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

  if (checkoutPackage.paymentUrl) {
    checkoutLink.href = checkoutPackage.paymentUrl;
    checkoutLink.textContent = `Betaal ${checkoutPackage.deposit} via Mollie`;
    checkoutLink.classList.remove("disabled-payment");
    checkoutLink.target = "_blank";
    checkoutLink.rel = "noopener";
  } else {
    checkoutLink.href = "#aanvraag";
    checkoutLink.textContent = "Betaallink volgt";
    checkoutLink.classList.add("disabled-payment");
    checkoutLink.removeAttribute("target");
    checkoutLink.removeAttribute("rel");
  }
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

formButton?.addEventListener("click", () => {
  if (termsAccepted && !termsAccepted.checked) {
    formButton.textContent = "Akkoord met voorwaarden is nodig";
    formButton.setAttribute("aria-live", "polite");
    return;
  }

  const formData = new FormData(form);
  const name = formData.get("name") || "nieuwe klant";
  const selectedPackage = formData.get("package") || "Business Launch";
  const selectedCarePackage = formData.get("carePackage") || "Nog geen keuze";

  formButton.textContent = `Aanvraag klaar voor ${selectedPackage}`;
  formButton.setAttribute("aria-live", "polite");

  const subject = encodeURIComponent(`Aanvraag ${selectedPackage} - ${name}`);
  const body = encodeURIComponent(
    `Naam: ${formData.get("name") || ""}\nE-mail: ${formData.get("email") || ""}\nWebsitepakket: ${selectedPackage}\nHosting & onderhoud: ${selectedCarePackage}\nAkkoord voorwaarden: ja\n\nBericht:\n${formData.get("message") || ""}`
  );

  window.location.href = `mailto:info@maxwebstudio.nl?subject=${subject}&body=${body}`;
});
