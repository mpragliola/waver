import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
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
