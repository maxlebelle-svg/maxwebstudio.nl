const toggle = document.querySelector("[data-menu-toggle]");
const mobile = document.querySelector("[data-mobile-nav]");

toggle?.addEventListener("click", () => {
  const open = mobile.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

mobile?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobile.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  });
}, { threshold: .12 });

document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
