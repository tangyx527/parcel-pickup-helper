import react from "@vitejs/plugin-react";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";

const outputDirectory = resolve("github-pages");

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

function offlineManifest(): Plugin {
  return {
    name: "parcel-pickup-offline-manifest",
    apply: "build",
    async closeBundle() {
      const serviceWorkerPath = resolve(outputDirectory, "sw.js");
      const files = (await listFiles(outputDirectory))
        .map((file) => relative(outputDirectory, file).split(sep).join("/"))
        .filter((file) => file !== "sw.js" && !file.endsWith(".map") && !file.startsWith("."));
      const urls = ["./", ...files.filter((file) => file !== "index.html").map((file) => `./${file}`)];
      const serviceWorker = await readFile(serviceWorkerPath, "utf8");
      await writeFile(
        serviceWorkerPath,
        serviceWorker.replace(
          /\/\* __PRECACHE_URLS__ \*\/ \[[^;]+\]/,
          `/* __PRECACHE_URLS__ */ ${JSON.stringify(urls)}`,
        ),
      );
    },
  };
}

export default defineConfig({
  base: "/parcel-pickup-helper/",
  publicDir: "public",
  plugins: [react(), offlineManifest()],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
  },
});
