import { describe, expect, it } from "vitest";
import { darkTheme, deriveSelectionColor, resolveTheme } from "./theme";

describe("deriveSelectionColor", () => {
  it("derives rgba from a hex color", () => {
    expect(deriveSelectionColor("#2B6CB0", 0.25)).toBe("rgba(43, 108, 176, 0.25)");
  });
  it("derives rgba from a shorthand hex color", () => {
    expect(deriveSelectionColor("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });
  it("derives rgba from an existing rgb color", () => {
    expect(deriveSelectionColor("rgb(10, 20, 30)", 0.4)).toBe("rgba(10, 20, 30, 0.4)");
  });
  it("falls back to a default for unparseable colors", () => {
    expect(deriveSelectionColor("not-a-color")).toBe("rgba(43, 108, 176, 0.45)");
  });
});

describe("resolveTheme", () => {
  it("merges overrides onto the base theme", () => {
    const result = resolveTheme(darkTheme, { backgroundColor: "#000000" });
    expect(result.backgroundColor).toBe("#000000");
    expect(result.waveformColor).toBe(darkTheme.waveformColor);
  });

  it("derives selectionColor from an overridden waveformColor when selectionColor isn't also overridden", () => {
    const result = resolveTheme(darkTheme, { waveformColor: "#FF0000" });
    expect(result.selectionColor).toBe("rgba(255, 0, 0, 0.45)");
  });

  it("keeps an explicit selectionColor override even when waveformColor also changes", () => {
    const result = resolveTheme(darkTheme, { waveformColor: "#FF0000", selectionColor: "rgba(1,2,3,0.9)" });
    expect(result.selectionColor).toBe("rgba(1,2,3,0.9)");
  });
});
