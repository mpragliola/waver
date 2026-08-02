import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // tsc (tsconfig.build.json) already wrote .d.ts files into dist/ before this runs —
    // the default emptyOutDir would wipe them out from under this step.
    emptyOutDir: false,
    lib: {
      entry: {
        waver: resolve(__dirname, "src/index.ts"),
        "waver-react": resolve(__dirname, "src/react/index.ts"),
        "waver-vue": resolve(__dirname, "src/vue/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "vue"],
    },
    sourcemap: true,
  },
});
