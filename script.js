const packageSelect = document.querySelector("#package-select");
const carePackageSelect = document.querySelector("#care-package-select");
const packageLinks = document.querySelectorAll("[data-package]");
const carePackageLinks = document.querySelectorAll("[data-care-package]");
const formButton = document.querySelector(".lead-form button");
const form = document.querySelector(".lead-form");
const checkoutOptions = document.querySelectorAll("[data-checkout-package]");
const checkoutTitle = document.querySelector("#checkout-title");
const checkoutDeposit = document.querySelector("#checkout-deposit");
const checkoutLink = document.querySelector("#checkout-link");
const caseSlider = document.querySelector("[data-case-slider]");
const caseSlides = document.querySelectorAll(".case-slide");
const caseDots = document.querySelectorAll("[data-case-dot]");
const casePrev = document.querySelector("[data-case-prev]");
const caseNext = document.querySelector("[data-case-next]");

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

formButton?.addEventListener("click", () => {
  const formData = new FormData(form);
  const name = formData.get("name") || "nieuwe klant";
  const selectedPackage = formData.get("package") || "Business Launch";
  const selectedCarePackage = formData.get("carePackage") || "Nog geen keuze";

  formButton.textContent = `Aanvraag klaar voor ${selectedPackage}`;
  formButton.setAttribute("aria-live", "polite");

  const subject = encodeURIComponent(`Aanvraag ${selectedPackage} - ${name}`);
  const body = encodeURIComponent(
    `Naam: ${formData.get("name") || ""}\nE-mail: ${formData.get("email") || ""}\nWebsitepakket: ${selectedPackage}\nHosting & onderhoud: ${selectedCarePackage}\n\nBericht:\n${formData.get("message") || ""}`
  );

  window.location.href = `mailto:maxlebelle@gmail.com?subject=${subject}&body=${body}`;
});
