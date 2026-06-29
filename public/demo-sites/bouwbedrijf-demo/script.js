const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const quoteForm = document.querySelector("[data-quote-form]");
const formMessage = document.querySelector("[data-form-message]");
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

menuToggle?.addEventListener("click", () => {
  const isOpen = mobileNav?.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", Boolean(isOpen));
  header?.classList.toggle("is-open", Boolean(isOpen));
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

quoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(quoteForm);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const projectType = String(formData.get("projectType") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!name || !email || !phone || !projectType || !message) {
    formMessage.textContent = "Vul de verplichte velden in, dan kunnen we je aanvraag goed beoordelen.";
    return;
  }

  quoteForm.reset();
  formMessage.textContent = "Bedankt! Je aanvraag is ontvangen. We nemen persoonlijk contact met je op.";
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();
