const packageSelect = document.querySelector("#package-select");
const packageLinks = document.querySelectorAll("[data-package]");
const formButton = document.querySelector(".lead-form button");
const form = document.querySelector(".lead-form");
const checkoutOptions = document.querySelectorAll("[data-checkout-package]");
const checkoutTitle = document.querySelector("#checkout-title");
const checkoutDeposit = document.querySelector("#checkout-deposit");
const checkoutLink = document.querySelector("#checkout-link");

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

checkoutOptions.forEach((option) => {
  option.addEventListener("click", () => {
    selectPackage(option.dataset.checkoutPackage);
  });
});

formButton?.addEventListener("click", () => {
  const formData = new FormData(form);
  const name = formData.get("name") || "nieuwe klant";
  const selectedPackage = formData.get("package") || "Business Launch";

  formButton.textContent = `Aanvraag klaar voor ${selectedPackage}`;
  formButton.setAttribute("aria-live", "polite");

  const subject = encodeURIComponent(`Aanvraag ${selectedPackage} - ${name}`);
  const body = encodeURIComponent(
    `Naam: ${formData.get("name") || ""}\nE-mail: ${formData.get("email") || ""}\nPakket: ${selectedPackage}\n\nBericht:\n${formData.get("message") || ""}`
  );

  window.location.href = `mailto:maxlebelle@gmail.com?subject=${subject}&body=${body}`;
});
