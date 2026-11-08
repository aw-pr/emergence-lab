import { getChrome, siteOwnsChrome } from "./chrome.ts";
import { REGISTRY, findEntry } from "./registry.ts";
import { backupJSON, copyName, SavedPresetStore, type SavedPreset } from "./savedPresets.ts";
import { trialPresets, type TrialPreset } from "./trialPresets.ts";

export const savedPresetStore = new SavedPresetStore(REGISTRY);

export async function resolveSavedPreset(id: string): Promise<(SavedPreset & { source: "personal" | "trial" }) | undefined> {
  const personal = await savedPresetStore.get(id);
  if (personal) return { ...personal, source: "personal" };
  const trial = (await trialPresets()).find((entry) => entry.id === id);
  return trial ? { ...trial, source: "trial" } : undefined;
}

export function presetHref(entry: SavedPreset): string {
  const { slug, variant } = entry.snapshot;
  return `#/${slug}${variant ? `/${variant}` : ""}?preset=${encodeURIComponent(entry.id)}`;
}

export function presetButton(label: string, action: () => void, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `preset-button${primary ? " preset-button--primary" : ""}`;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function downloadPresets(raw: string, filename = "emergence-presets.json"): void {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function presetNameDialog(options: {
  parent: HTMLElement;
  trigger: HTMLElement;
  title: string;
  initial?: string;
  save(name: string): Promise<void>;
  restoreFocus?(): void;
}): () => void {
  const dialog = element("dialog", "preset-dialog");
  const title = element("h2", "", options.title);
  title.id = `preset-dialog-${crypto.randomUUID()}`;
  dialog.setAttribute("aria-labelledby", title.id);
  const form = element("form", "preset-dialog__form");
  const label = element("label", "preset-field");
  label.append(element("span", "", "Preset name"));
  const input = element("input", "");
  input.type = "text";
  input.maxLength = 64;
  input.required = true;
  input.value = options.initial ?? "";
  label.append(input);
  const error = element("p", "preset-error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = element("div", "preset-dialog__actions");
  const cancel = presetButton("Cancel", () => dialog.close());
  const save = presetButton("Save", () => {}, true);
  save.type = "submit";
  actions.append(cancel, save);
  form.append(label, error, actions);
  dialog.append(title, form);
  options.parent.append(dialog);
  let active = true;
  const dispose = () => {
    active = false;
    dialog.remove();
  };
  dialog.addEventListener("close", () => {
    dispose();
    if (options.trigger.isConnected) options.trigger.focus();
    else options.restoreFocus?.();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    error.hidden = true;
    try {
      await options.save(input.value);
      if (active) dialog.close();
    } catch (reason) {
      if (!active) return;
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      error.hidden = false;
      save.disabled = false;
      input.focus();
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.stopPropagation(); return; }
    if (event.key !== "Tab") return;
    const fields = [input, cancel, save].filter((field) => !field.disabled);
    const first = fields[0];
    const last = fields[fields.length - 1];
    if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
  });
  dialog.showModal();
  input.focus();
  input.select();
  return dispose;
}

export function renderPresetLibrary(container: HTMLElement): { dispose(): void } {
  container.innerHTML = "";
  const page = element("section", "preset-library");
  const nav = element("nav", "preset-library__nav");
  nav.setAttribute("aria-label", "Preset navigation");
  const gallery = element("a", "", "Gallery");
  gallery.href = siteOwnsChrome() ? getChrome().siteGalleryHref : "#/";
  nav.append(gallery, element("span", "", "Simulation library"));
  const header = element("header", "preset-library__header");
  header.append(element("h1", "", "Presets"), element("p", "preset-library__intro", "Keep a configuration. Come back to it. Start something new."));
  const local = element("div", "preset-library__local");
  local.append(element("p", "", "Personal presets are saved in this browser, on this site."), element("p", "", "Export a backup to move them elsewhere. Opening a preset starts a fresh run; it does not restore a live field or camera gestures."));
  const backups = element("div", "preset-library__backups");
  const exportButton = presetButton("Export presets", () => {
    void savedPresetStore.list().then((entries) => {
      downloadPresets(backupJSON(entries));
      announce("Personal presets exported.");
    });
  });
  const importLabel = element("label", "preset-button preset-library__import", "Import presets");
  const importInput = element("input", "");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.setAttribute("aria-label", "Import presets");
  importLabel.append(importInput);
  backups.append(exportButton, importLabel);
  local.append(backups);
  const fields = element("div", "preset-library__filters");
  const searchLabel = element("label", "preset-field");
  const search = element("input", "");
  search.type = "search";
  search.placeholder = "Find a configuration…";
  searchLabel.append(element("span", "", "Search presets"), search);
  const simLabel = element("label", "preset-field");
  const simulation = element("select", "");
  simulation.setAttribute("aria-label", "Simulation");
  const all = element("option", "", "All simulations");
  all.value = "";
  simulation.append(all);
  for (const entry of REGISTRY) {
    const option = element("option", "", entry.name);
    option.value = entry.slug;
    simulation.append(option);
  }
  simLabel.append(element("span", "", "Simulation"), simulation);
  fields.append(searchLabel, simLabel);
  const alert = element("div", "preset-error");
  alert.setAttribute("role", "alert");
  alert.hidden = true;
  const recovery = element("div", "preset-library__backups");
  recovery.hidden = true;
  const status = element("div", "preset-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const lists = element("div", "preset-library__lists");
  page.append(nav, header, local, fields, alert, recovery, status, lists);
  container.append(page);
  let disposed = false;
  let entries: SavedPreset[] = [];
  let trials: TrialPreset[] = [];
  let undo: SavedPreset | undefined;
  let dismissDialog: (() => void) | undefined;
  let refreshToken = 0;
  const abort = new AbortController();

  function announce(text: string): void {
    if (disposed) return;
    status.replaceChildren(element("span", "", text + (savedPresetStore.warning ? ` ${savedPresetStore.warning}` : "")));
    if (undo) status.append(presetButton("Undo", () => {
      const entry = undo;
      if (!entry) return;
      void mutate(async () => { await savedPresetStore.restore(entry); announce(`Restored “${entry.name}”.`); });
    }));
  }

  function showError(reason: unknown): void {
    if (disposed) return;
    alert.textContent = reason instanceof Error ? reason.message : String(reason);
    alert.hidden = false;
  }

  async function refresh(): Promise<void> {
    const token = ++refreshToken;
    const [personal, catalogue] = await Promise.all([savedPresetStore.list(), trialPresets()]);
    if (disposed || token !== refreshToken) return;
    entries = personal;
    trials = catalogue;
    if (savedPresetStore.error) showError(savedPresetStore.error);
    recovery.hidden = !savedPresetStore.error;
    recovery.replaceChildren();
    if (savedPresetStore.error) {
      const download = presetButton("Download raw data", () => downloadPresets(savedPresetStore.raw ?? "", "emergence-presets-recovery.json"));
      download.disabled = savedPresetStore.raw === null;
      recovery.append(download, presetButton("Reset library", () => {
        const dialog = element("dialog", "preset-dialog");
        dialog.setAttribute("aria-label", "Reset preset library");
        dialog.append(element("h2", "", "Reset this browser’s library?"), element("p", "", "This removes the unreadable stored data and all personal saves. Download the raw data first if you need to recover it."));
        const actions = element("div", "preset-dialog__actions");
        actions.append(presetButton("Cancel", () => dialog.close()), presetButton("Reset library", () => {
          void mutate(async () => { await savedPresetStore.reset(); announce("Personal library reset."); dialog.close(); });
        }, true));
        dialog.append(actions);
        page.append(dialog);
        dialog.addEventListener("close", () => dialog.remove());
        dialog.showModal();
      }));
    }
    if (savedPresetStore.warning && !status.textContent) announce("Personal library available in memory.");
    renderLists();
  }

  async function mutate(action: () => Promise<void>): Promise<void> {
    undo = undefined;
    status.querySelector("button")?.remove();
    alert.hidden = true;
    try { await action(); await refresh(); } catch (reason) { showError(reason); }
  }

  function nameAction(entry: SavedPreset, action: "Rename" | "Duplicate", trigger: HTMLElement): void {
    dismissDialog = presetNameDialog({
      parent: page,
      trigger,
      title: `${action} preset`,
      restoreFocus: () => {
        const item = page.querySelector(`[data-preset-id="${CSS.escape(entry.id)}"]`);
        const button = Array.from(item?.querySelectorAll("button") ?? []).find((button) => button.textContent === action);
        button?.focus();
      },
      initial: action === "Rename" ? entry.name : copyName(entry.name, entries),
      save: async (name) => {
        if (action === "Rename") await savedPresetStore.rename(entry.id, name);
        else await savedPresetStore.duplicate(entry.id, name);
        undo = undefined;
        alert.hidden = true;
        announce(action === "Rename" ? "Preset renamed." : "Preset duplicated.");
        await refresh();
      },
    });
  }

  function renderLists(): void {
    lists.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const matches = (entry: SavedPreset) => (!simulation.value || entry.snapshot.slug === simulation.value) && entry.name.toLowerCase().includes(query);
    const personal = entries.filter(matches);
    const sources = trials.filter(matches);
    const group = (heading: string, description: string, items: SavedPreset[], source: "personal" | "trial") => {
      const section = element("section", "preset-library__group");
      const headingRow = element("div", "preset-library__group-heading");
      headingRow.append(element("h2", "", heading), element("span", "", String(items.length)));
      section.append(headingRow, element("p", "preset-library__group-description", description));
      const list = element("ul", "preset-library__items");
      for (const entry of items) {
        const item = element("li", "preset-item");
        item.dataset.presetId = entry.id;
        item.dataset.presetName = entry.name;
        item.dataset.presetSource = source;
        item.dataset.presetSlug = entry.snapshot.slug;
        if (source === "trial") item.dataset.presetRow = (entry as TrialPreset).row;
        const info = element("div", "preset-item__info");
        const model = findEntry(entry.snapshot.slug)!;
        const modelName = model.variants?.find((v) => v.variant === entry.snapshot.variant)?.name ?? model.name;
        const meta = element("div", "preset-item__meta");
        meta.append(element("span", "", modelName), element("span", `preset-item__badge preset-item__badge--${source}`, source === "trial" ? "Trial · stage 144" : "Personal"));
        info.append(meta, element("h3", "", entry.name));
        if (source === "trial") {
          const provenance = element("details", "preset-item__provenance");
          provenance.append(element("summary", "", "Source configuration"), element("p", "", (entry as TrialPreset).sourceId));
          info.append(provenance);
        }
        const actions = element("div", "preset-item__actions");
        if (source === "personal") {
          for (const action of ["Rename", "Duplicate"] as const) {
            const button = presetButton(action, () => nameAction(entry, action, button));
            actions.append(button);
          }
          actions.append(presetButton("Delete", () => {
            void mutate(async () => {
              undo = await savedPresetStore.delete(entry.id);
              announce(`Deleted “${entry.name}”.`);
            });
          }));
        }
        actions.append(presetButton("Open", () => { window.location.hash = presetHref(entry); }, true));
        item.append(info, actions);
        list.append(item);
      }
      section.append(list);
      if (!items.length) {
        const empty = element("div", "preset-empty");
        empty.append(element("h3", "", source === "personal" && !entries.length ? "Your next discovery belongs here" : "No matching presets"), element("p", "", source === "personal" && !entries.length ? "Open a simulation, adjust its controls and choose Save preset. Your named configurations will appear here." : "Try another name or select all simulations."));
        if (source === "personal" && !entries.length) {
          const link = element("a", "preset-button", "Explore simulations");
          link.href = "#/";
          empty.append(link);
        }
        section.append(empty);
      }
      lists.append(section);
    };
    group("Your presets", "Personal configurations, ready for a fresh run.", personal, "personal");
    group("From the research bench", "Nine read-only trials at shipped populations. Save a personal copy to make one your own. These are candidates, not promoted defaults; live trajectories vary with canvas size and time.", sources, "trial");
  }

  search.addEventListener("input", renderLists);
  simulation.addEventListener("change", renderLists);
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void mutate(async () => {
      if (file.size > 1024 * 1024) throw new Error("Import files must be at most 1 MiB.");
      const count = await savedPresetStore.import(await file.text());
      announce(`Imported ${count} personal preset${count === 1 ? "" : "s"}.`);
    });
    importInput.value = "";
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "el:saved-presets:v1" || event.key === null) {
      undo = undefined;
      announce("Personal library changed in another tab.");
      void refresh().catch(showError);
    }
  }, { signal: abort.signal });
  void refresh().catch(showError);
  return { dispose() { disposed = true; abort.abort(); dismissDialog?.(); page.querySelectorAll("dialog").forEach((dialog) => dialog.remove()); undo = undefined; } };
}
