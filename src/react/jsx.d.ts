import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { WaverElement } from "../waver-element";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wave-r": DetailedHTMLProps<HTMLAttributes<WaverElement>, WaverElement>;
    }
  }
}
