import { DEMO_SITE_STATUS, listDemoSites } from "../config/demoSites.js";

const statusLabels = Object.freeze({
  [DEMO_SITE_STATUS.PREPARED]: "Voorbereid",
  [DEMO_SITE_STATUS.PLANNED]: "Gepland",
  [DEMO_SITE_STATUS.LIVE]: "Live",
});

function createElement(tagName, className, text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createPreview(demoSite) {
  const preview = createElement("div", "official-demo-preview");
  preview.style.setProperty("--demo-accent", demoSite.accentColor || "#155eef");

  const desktop = createElement("div", "official-demo-desktop");
  const desktopTop = createElement("div", "official-demo-browser-top");
  desktopTop.append(createElement("span"), createElement("span"), createElement("span"), createElement("p", "", `${demoSite.id}.nl`));

  const desktopBody = createElement("div", "official-demo-browser-body");
  const nav = createElement("div", "official-demo-mini-nav");
  nav.append(createElement("strong", "", demoSite.name), createElement("span", "", "Diensten"), createElement("span", "", "Contact"));

  const hero = createElement("div", "official-demo-mini-hero");
  hero.append(
    createElement("strong", "", demoSite.industry),
    createElement("p", "", demoSite.description),
    createElement("em", "", demoSite.ctaLabel || "Bekijk live demo"),
  );

  const blocks = createElement("div", "official-demo-mini-blocks");
  demoSite.tags.slice(0, 3).forEach((tag) => blocks.append(createElement("span", "", tag)));
  desktopBody.append(nav, hero, blocks);
  desktop.append(desktopTop, desktopBody);

  const phone = createElement("div", "official-demo-mobile");
  phone.append(createElement("span"), createElement("strong", "", demoSite.name), createElement("p", "", demoSite.ctaLabel || "Demo bekijken"));

  preview.append(desktop, phone);
  return preview;
}

function createActionLink(label, href, className) {
  const link = document.createElement("a");
  link.className = className;
  link.textContent = label;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
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

function createDemoCard(demoSite) {
  const card = createElement("article", "official-demo-card");
  card.dataset.demoSiteId = demoSite.id;
  card.append(createPreview(demoSite));

  const copy = createElement("div", "official-demo-copy");
  const meta = createElement("div", "official-demo-meta");
  meta.append(createElement("span", "", demoSite.industry), createElement("mark", "", statusLabels[demoSite.status] || demoSite.status));

  const title = createElement("h3", "", demoSite.name);
  const description = createElement("p", "", demoSite.description);
  const tags = createElement("div", "official-demo-tags");
  demoSite.tags.forEach((tag) => tags.append(createElement("span", "", tag)));

  const actions = createElement("div", "official-demo-actions");
  const isLive = demoSite.status === DEMO_SITE_STATUS.LIVE && demoSite.demoUrl;
  actions.append(
    isLive
      ? createActionLink(demoSite.ctaLabel || "Bekijk live demo", demoSite.demoUrl, "button primary")
      : createDisabledAction("Binnenkort live", "button secondary"),
    demoSite.detailsUrl
      ? createActionLink("Bekijk details", demoSite.detailsUrl, "button secondary")
      : createDisabledAction("Details volgen", "button secondary"),
  );

  copy.append(meta, title, description, tags, actions);
  card.append(copy);
  return card;
}

export function renderDemoPortfolioEngine(root = document) {
  const grid = root.querySelector("[data-demo-sites-grid]");
  const count = root.querySelector("[data-demo-sites-count]");
  if (!grid) return;

  const demoSites = listDemoSites();
  grid.replaceChildren(...demoSites.map(createDemoCard));
  if (count) count.textContent = `${demoSites.length} demos voorbereid`;
}

renderDemoPortfolioEngine();
