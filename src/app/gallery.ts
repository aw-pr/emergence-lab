import { REGISTRY } from "./registry.ts";

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

  for (const entry of REGISTRY) {
    const card = document.createElement("li");
    card.className = "gallery__card";

    const link = document.createElement("a");
    link.className = "gallery__link";
    link.href = `#/${entry.slug}`;

    const name = document.createElement("h2");
    name.textContent = entry.name;
    link.appendChild(name);

    if (entry.description) {
      const desc = document.createElement("p");
      desc.textContent = entry.description;
      link.appendChild(desc);
    }

    card.appendChild(link);
    grid.appendChild(card);
  }

  page.appendChild(grid);
  container.appendChild(page);
}
