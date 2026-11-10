import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Сборка кладётся прямо в расширение: media/webview/index.{js,css}.
// Имена файлов фиксированы, чтобы расширение подключало их без манифеста.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  // Банк задач лежит в корне репозитория (tasks/) и встраивается в сборку.
  server: { fs: { allow: ["../.."] } },
  build: {
    outDir: "../extension/media/webview",
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "index.js",
        assetFileNames: "index.[ext]",
        inlineDynamicImports: true,
      },
    },
  },
});
