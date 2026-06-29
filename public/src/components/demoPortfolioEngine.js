import { DEMO_SITE_STATUS, listDemoSites } from "../config/demoSites.js";

const statusLabels = Object.freeze({
  [DEMO_SITE_STATUS.PREPARED]: "Voorbereid",
  [DEMO_SITE_STATUS.PLANNED]: "Gepland",
  [DEMO_SITE_STATUS.LIVE]: "Live",
});

const scoreLabels = Object.freeze({
  scoreSeo: "SEO",
  scorePerformance: "Performance",
  scoreResponsive: "Responsive",
  scoreConversion: "Conversie",
});

function createElement(tagName, className, text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function getImageUrl(imagePath) {
  if (!imagePath) return "";
  return imagePath.startsWith("http") ? imagePath : `/${imagePath}`;
}

function createPreview(demoSite) {
  const preview = createElement("div", "official-demo-preview");
  preview.style.setProperty("--demo-accent", demoSite.accentColor || "#155eef");
  if (demoSite.desktopThumbnail) {
    preview.style.setProperty("--demo-cover", `url("${getImageUrl(demoSite.desktopThumbnail)}")`);
  }

  const deviceBadges = createElement("div", "official-demo-device-badges");
  (demoSite.devices || ["desktop", "mobile"]).forEach((device) => deviceBadges.append(createElement("span", "", device)));

  const desktop = createElement("div", "official-demo-desktop");
  const desktopTop = createElement("div", "official-demo-browser-top");
  desktopTop.append(createElement("span"), createElement("span"), createElement("span"), createElement("p", "", `${demoSite.id}.nl`));

  const desktopBody = createElement("div", "official-demo-browser-body");
  const nav = createElement("div", "official-demo-mini-nav");
  nav.append(createElement("strong", "", demoSite.name), createElement("span", "", "Diensten"), createElement("span", "", "Contact"));

  const hero = createElement("div", "official-demo-mini-hero");
  hero.append(
    createElement("strong", "", demoSite.previewTitle || demoSite.industry),
    createElement("p", "", demoSite.previewSubtitle || demoSite.description),
    createElement("em", "", demoSite.primaryCtaLabel || demoSite.ctaLabel || "Bekijk live demo"),
  );

  const blocks = createElement("div", "official-demo-mini-blocks");
  (demoSite.highlights || demoSite.tags || []).slice(0, 3).forEach((tag) => blocks.append(createElement("span", "", tag)));
  desktopBody.append(nav, hero, blocks);
  desktop.append(desktopTop, desktopBody);

  const phone = createElement("div", "official-demo-mobile");
  if (demoSite.mobileThumbnail || demoSite.desktopThumbnail) {
    phone.style.setProperty("--demo-mobile-cover", `url("${getImageUrl(demoSite.mobileThumbnail || demoSite.desktopThumbnail)}")`);
  }
  phone.append(createElement("span"), createElement("strong", "", demoSite.name), createElement("p", "", demoSite.primaryCtaLabel || demoSite.ctaLabel || "Demo bekijken"));

  preview.append(deviceBadges, desktop, phone);
  return preview;
}

function createActionLink(label, href, className, opensNewTab = true) {
  const link = document.createElement("a");
  link.className = className;
  link.textContent = label;
  link.href = href;
  if (opensNewTab) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function createDisabledAction(label, className) {
  const button = document.createElement("button");
  button.className = `${className} is-disabled`;
  button.type = "button";
  button.disabled = true;
  button.textContent = label;
  return button;
}

function getCardStep(grid) {
  const firstCard = grid.querySelector(".official-demo-card");
  if (!firstCard) return 0;
  const styles = window.getComputedStyle(grid);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return firstCard.getBoundingClientRect().width + gap;
}

function getActiveIndex(grid) {
  const step = getCardStep(grid);
  if (!step) return 0;
  return Math.round(grid.scrollLeft / step);
}

function scrollToDemoCard(grid, index) {
  const cards = [...grid.querySelectorAll(".official-demo-card")];
  const target = cards[Math.max(0, Math.min(index, cards.length - 1))];
  if (!target) return;
  grid.scrollTo({
    left: target.offsetLeft - grid.offsetLeft,
    behavior: "smooth",
  });
}

function updateCarouselState(grid, dots) {
  const cards = [...grid.querySelectorAll(".official-demo-card")];
  const activeIndex = Math.max(0, Math.min(getActiveIndex(grid), cards.length - 1));
  cards.forEach((card, index) => card.classList.toggle("is-active", index === activeIndex));
  dots.forEach((dot, index) => {
    dot.classList.toggle("active", index === activeIndex);
    dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
  });
}

function setupCarousel(root, demoSites) {
  const grid = root.querySelector("[data-demo-sites-grid]");
  const prev = root.querySelector("[data-official-demo-prev]");
  const next = root.querySelector("[data-official-demo-next]");
  const dotsContainer = root.querySelector("[data-official-demo-dots]");
  if (!grid || !dotsContainer) return;

  const dots = demoSites.map((demoSite, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `${demoSite.name} tonen`);
    dot.addEventListener("click", () => scrollToDemoCard(grid, index));
    dotsContainer.append(dot);
    return dot;
  });

  prev?.addEventListener("click", () => scrollToDemoCard(grid, getActiveIndex(grid) - 1));
  next?.addEventListener("click", () => scrollToDemoCard(grid, getActiveIndex(grid) + 1));

  grid.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scrollToDemoCard(grid, getActiveIndex(grid) + (event.key === "ArrowRight" ? 1 : -1));
  });

  let scrollFrame = 0;
  grid.addEventListener("scroll", () => {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => updateCarouselState(grid, dots));
  }, { passive: true });
  window.addEventListener("resize", () => updateCarouselState(grid, dots));
  updateCarouselState(grid, dots);
}

function createScoreGrid(demoSite) {
  const grid = createElement("div", "official-demo-score-grid");
  Object.entries(scoreLabels).forEach(([key, label]) => {
    const score = Number(demoSite[key] || 0);
    const item = createElement("span");
    item.append(createElement("strong", "", score ? String(score) : "-"), createElement("small", "", label));
    grid.append(item);
  });
  return grid;
}

function createMetadata(demoSite) {
  const meta = createElement("div", "official-demo-info-grid");
  [
    ["Branche", demoSite.branche || demoSite.industry],
    ["Pagina's", demoSite.aantalPaginas ? String(demoSite.aantalPaginas) : "-"],
    ["Doorlooptijd", demoSite.doorlooptijd || "-"],
  ].forEach(([label, value]) => {
    const item = createElement("span");
    item.append(createElement("small", "", label), createElement("strong", "", value));
    meta.append(item);
  });
  return meta;
}

function createDemoCard(demoSite) {
  const card = createElement("article", "official-demo-card");
  card.dataset.demoSiteId = demoSite.id;
  card.append(createPreview(demoSite));

  const copy = createElement("div", "official-demo-copy");
  const meta = createElement("div", "official-demo-meta");
  meta.append(createElement("span", "", demoSite.showcaseLabel || demoSite.industry), createElement("mark", "", demoSite.statusLabel || statusLabels[demoSite.status] || demoSite.status));

  const title = createElement("h3", "", demoSite.name);
  const description = createElement("p", "", demoSite.description);
  const rating = createElement("div", "official-demo-rating", "★★★★★");
  const audience = createElement("p", "official-demo-audience", demoSite.doelgroep ? `Ontworpen voor: ${demoSite.doelgroep}` : "");
  const tags = createElement("div", "official-demo-tags");
  (demoSite.highlights || demoSite.tags || []).forEach((tag) => tags.append(createElement("span", "", tag)));

  const actions = createElement("div", "official-demo-actions");
  const isLive = demoSite.status === DEMO_SITE_STATUS.LIVE && demoSite.demoUrl;
  actions.append(
    isLive
      ? createActionLink(demoSite.primaryCtaLabel || demoSite.ctaLabel || "Bekijk live demo", demoSite.demoUrl, "button primary")
      : createDisabledAction("Binnenkort live", "button secondary"),
    demoSite.requestUrl
      ? createActionLink(demoSite.secondaryCtaLabel || "Vraag deze website aan", demoSite.requestUrl, "button secondary", false)
      : createDisabledAction("Aanvraag volgt", "button secondary"),
  );

  copy.append(meta, rating, title, description);
  if (audience.textContent) copy.append(audience);
  copy.append(tags, createScoreGrid(demoSite), createMetadata(demoSite), actions);
  card.append(copy);
  return card;
}

export function renderDemoPortfolioEngine(root = document) {
  const grid = root.querySelector("[data-demo-sites-grid]");
  const count = root.querySelector("[data-demo-sites-count]");
  const dots = root.querySelector("[data-official-demo-dots]");
  if (!grid) return;

  const demoSites = listDemoSites();
  dots?.replaceChildren();
  grid.replaceChildren(...demoSites.map(createDemoCard));
  if (count) {
    const liveCount = demoSites.filter((demoSite) => demoSite.status === DEMO_SITE_STATUS.LIVE).length;
    count.textContent = `${liveCount} live / ${demoSites.length} voorbereid`;
  }
  setupCarousel(root, demoSites);
}

renderDemoPortfolioEngine();
