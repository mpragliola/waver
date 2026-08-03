import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { WaverElement } from "../waver-element";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // React 18 sets attributes on hyphenated (custom-element) tags using the literal prop name
      // rather than translating className -> class, so the element must be given `class` directly.
      "wave-r": DetailedHTMLProps<HTMLAttributes<WaverElement>, WaverElement> & { class?: string };
    }
  }
}
