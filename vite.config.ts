import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const repository = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const [owner, repo] = repository;
const projectPageBase =
  owner && repo && repo.toLowerCase() !== `${owner}.github.io`.toLowerCase()
    ? `/${repo}/`
    : "/";

export default defineConfig({
  root: projectRoot,
  base: process.env.VITE_BASE_PATH || projectPageBase,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
  },
});
