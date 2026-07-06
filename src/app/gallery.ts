import { REGISTRY, type SimEntry } from "./registry.ts";

const UNGROUPED_FAMILY = "Other";

/** Families are ordered by this priority, then by registry-encounter order.
 * Swarm & Flocking leads. */
const FAMILY_PRIORITY: readonly string[] = ["Swarm & Flocking"];

/** A single gallery card. One sim entry yields one card, unless it declares
 * variants (e.g. each strange attractor), in which case it yields one per
 * variant. */
interface CardModel {
  href: string;
  name: string;
  blurb?: string;
  family: string;
  /** Basename of the pre-rendered still in /thumbnails (see
   * scripts/generate-thumbnails.mjs). */
  thumbKey: string;
}

export function renderGallery(container: HTMLElement): void {
  container.innerHTML = "";

  const page = document.createElement("section");
  page.className = "gallery";

  const header = document.createElement("header");
  header.className = "gallery__header";

  const title = document.createElement("h1");
  title.textContent = "emergence-lab";
  header.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "gallery__subtitle";
  subtitle.textContent =
    "A collection of emergent-behaviour simulations. Pick one to watch it run.";
  header.appendChild(subtitle);

  page.appendChild(header);

  const grid = document.createElement("ul");
  grid.className = "gallery__grid";
  for (const card of orderCards(buildCards(REGISTRY))) {
    grid.appendChild(renderCard(card));
  }
  page.appendChild(grid);

  container.appendChild(page);
}

function buildCards(entries: readonly SimEntry[]): CardModel[] {
  const cards: CardModel[] = [];
  for (const entry of entries) {
    const family = entry.family ?? UNGROUPED_FAMILY;
    if (entry.variants && entry.variants.length > 0) {
      for (const variant of entry.variants) {
        cards.push({
          href: `#/${entry.slug}/${variant.variant}`,
          name: variant.name,
          blurb: variant.subtitle ?? variant.description,
          family,
          thumbKey: `${entry.slug}__${variant.variant}`,
        });
      }
    } else {
      cards.push({
        href: `#/${entry.slug}`,
        name: entry.name,
        blurb: entry.subtitle ?? entry.description,
        family,
        thumbKey: entry.slug,
      });
    }
  }
  return cards;
}

/** Group cards by family so families stay contiguous in the single grid, with
 * the priority families first. A stable sort preserves registry order within
 * and between equal-rank families. */
function orderCards(cards: readonly CardModel[]): CardModel[] {
  const familyOrder: string[] = [];
  for (const card of cards) {
    if (!familyOrder.includes(card.family)) familyOrder.push(card.family);
  }
  familyOrder.sort((a, b) => familyRank(a) - familyRank(b));

  return familyOrder.flatMap((family) =>
    cards.filter((card) => card.family === family),
  );
}

function familyRank(family: string): number {
  const index = FAMILY_PRIORITY.indexOf(family);
  return index === -1 ? FAMILY_PRIORITY.length : index;
}

function renderCard(card: CardModel): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "gallery__card";

  const link = document.createElement("a");
  link.className = "gallery__link";
  link.href = card.href;

  const thumb = document.createElement("div");
  thumb.className = "gallery__thumb";

  const img = document.createElement("img");
  img.className = "gallery__thumb-img";
  img.src = `thumbnails/${card.thumbKey}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 640;
  img.height = 400;
  thumb.appendChild(img);

  link.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "gallery__card-body";

  const name = document.createElement("h3");
  name.textContent = card.name;
  body.appendChild(name);

  const tag = document.createElement("span");
  tag.className = "gallery__tag";
  tag.textContent = card.family;
  body.appendChild(tag);

  if (card.blurb) {
    const desc = document.createElement("p");
    desc.textContent = card.blurb;
    body.appendChild(desc);
  }

  link.appendChild(body);
  item.appendChild(link);

  return item;
}
