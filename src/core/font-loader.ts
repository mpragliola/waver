import type { GoogleFontSpec } from "./types";

const injected = new Set<string>();

/**
 * Injects a Google Fonts stylesheet <link> for the given family, deduped per document
 * so multiple Waver instances (or themes sharing a family) never load it twice.
 */
export function ensureGoogleFont(spec: GoogleFontSpec, doc: Document = document): void {
  const weights = spec.weights && spec.weights.length > 0 ? spec.weights : [400, 500, 600];
  const key = `${spec.family}:${weights.join(",")}`;
  if (injected.has(key)) return;
  if (doc.querySelector(`link[data-waver-font="${key}"]`)) {
    injected.add(key);
    return;
  }

  const familyParam = `${spec.family.replace(/ /g, "+")}:wght@${weights.join(";")}`;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
  link.dataset.waverFont = key;
  doc.head.appendChild(link);
  injected.add(key);
}

/** Test-only: clears the dedup cache. */
export function resetFontLoaderCache(): void {
  injected.clear();
}
