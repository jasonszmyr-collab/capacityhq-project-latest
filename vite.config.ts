import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",

  plugins: [react(), tailwindcss(), tsconfigPaths(), svgr()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),

      // ⭐ CRITICAL FIX FOR YOUR PROJECT
      "react-native": "react-native-web",
    },
  },

  optimizeDeps: {
    // ⭐ Prevent Vite from choking on RN modules
    exclude: [
      "react-native",
      "react-native-web",
      "react-native-gesture-handler",
      "react-native-reanimated",
    ],
  },
});

