import { beforeEach, describe, expect, it } from "vitest";
import { ensureGoogleFont, resetFontLoaderCache } from "./font-loader";

describe("ensureGoogleFont", () => {
  beforeEach(() => {
    resetFontLoaderCache();
    document.head.innerHTML = "";
  });

  it("injects a stylesheet link for the requested family", () => {
    ensureGoogleFont({ family: "Google Sans", weights: [400, 600] });
    const link = document.head.querySelector("link[data-waver-font]");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toContain("family=Google+Sans:wght@400;600");
  });

  it("does not inject a duplicate link for the same family/weights", () => {
    ensureGoogleFont({ family: "Google Sans", weights: [400] });
    ensureGoogleFont({ family: "Google Sans", weights: [400] });
    expect(document.head.querySelectorAll("link[data-waver-font]").length).toBe(1);
  });

  it("injects separate links for different weight sets", () => {
    ensureGoogleFont({ family: "Google Sans", weights: [400] });
    ensureGoogleFont({ family: "Google Sans", weights: [700] });
    expect(document.head.querySelectorAll("link[data-waver-font]").length).toBe(2);
  });

  it("defaults to standard weights when none are provided", () => {
    ensureGoogleFont({ family: "Roboto" });
    const link = document.head.querySelector("link[data-waver-font]");
    expect(link?.getAttribute("href")).toContain("wght@400;500;600");
  });
});
