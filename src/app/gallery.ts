import { REGISTRY, type SimEntry } from "./registry.ts";
import { paintKernelThumbnail } from "./thumbnail.ts";

const UNGROUPED_FAMILY = "Other";

/** Physical thumbnail canvas size (device pixels). Deliberately small and
 * cheap — this is a still, not a live sim. */
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 200;

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

  const observer = createThumbnailObserver();

  for (const group of groupByFamily(REGISTRY)) {
    page.appendChild(renderFamilyGroup(group, observer));
  }

  container.appendChild(page);
}

interface FamilyGroup {
  family: string;
  entries: readonly SimEntry[];
}

function groupByFamily(entries: readonly SimEntry[]): FamilyGroup[] {
  const order: string[] = [];
  const byFamily = new Map<string, SimEntry[]>();

  for (const entry of entries) {
    const family = entry.family ?? UNGROUPED_FAMILY;
    if (!byFamily.has(family)) {
      byFamily.set(family, []);
      order.push(family);
    }
    byFamily.get(family)!.push(entry);
  }

  return order.map((family) => ({ family, entries: byFamily.get(family)! }));
}

function renderFamilyGroup(
  group: FamilyGroup,
  observer: IntersectionObserver | null,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "gallery__family";

  const heading = document.createElement("h2");
  heading.className = "gallery__family-heading";
  heading.textContent = group.family;
  section.appendChild(heading);

  const grid = document.createElement("ul");
  grid.className = "gallery__grid";

  for (const entry of group.entries) {
    grid.appendChild(renderCard(entry, observer));
  }

  section.appendChild(grid);
  return section;
}

function renderCard(
  entry: SimEntry,
  observer: IntersectionObserver | null,
): HTMLLIElement {
  const card = document.createElement("li");
  card.className = "gallery__card";

  const link = document.createElement("a");
  link.className = "gallery__link";
  link.href = `#/${entry.slug}`;

  const thumb = document.createElement("div");
  thumb.className = "gallery__thumb";
  thumb.dataset.slug = entry.slug;

  const placeholder = document.createElement("div");
  placeholder.className = "gallery__thumb-placeholder";
  thumb.appendChild(placeholder);

  link.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "gallery__card-body";

  const name = document.createElement("h3");
  name.textContent = entry.name;
  body.appendChild(name);

  if (entry.description) {
    const desc = document.createElement("p");
    desc.textContent = entry.description;
    body.appendChild(desc);
  }

  link.appendChild(body);
  card.appendChild(link);

  if (observer) {
    observer.observe(thumb);
  } else {
    // No IntersectionObserver support: just load it directly.
    void loadThumbnail(entry.slug, thumb, placeholder);
  }

  return card;
}

function createThumbnailObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const observed of entries) {
        if (!observed.isIntersecting) continue;
        const el = observed.target as HTMLElement;
        obs.unobserve(el);
        const slug = el.dataset.slug;
        const placeholder = el.querySelector<HTMLElement>(
          ".gallery__thumb-placeholder",
        );
        if (slug) {
          void loadThumbnail(slug, el, placeholder);
        }
      }
    },
    { rootMargin: "200px" },
  );

  return observer;
}

async function loadThumbnail(
  slug: string,
  thumbContainer: HTMLElement,
  placeholder: HTMLElement | null,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  canvas.className = "gallery__thumb-canvas";

  try {
    await paintKernelThumbnail(slug, canvas);
    thumbContainer.replaceChildren(canvas);
    thumbContainer.classList.add("gallery__thumb--ready");
  } catch (error) {
    // Degrade gracefully: keep the text-only card, drop the broken thumbnail.
    console.warn(`emergence-lab: thumbnail failed for "${slug}"`, error);
    placeholder?.remove();
    thumbContainer.classList.add("gallery__thumb--failed");
  }
}
