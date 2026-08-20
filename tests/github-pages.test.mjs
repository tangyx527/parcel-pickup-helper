import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds a self-contained GitHub Pages app", async () => {
  const [html, serviceWorker, manifest, workflow] = await Promise.all([
    readFile(new URL("../github-pages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(html, /\/parcel-pickup-helper\/assets\/index-[^"']+\.js/);
  assert.match(html, /\/parcel-pickup-helper\/assets\/index-[^"']+\.css/);
  assert.match(serviceWorker, /PRECACHE_URLS[^\n]+assets\/index-[^"']+\.js/);
  assert.match(serviceWorker, /PRECACHE_URLS[^\n]+assets\/index-[^"']+\.css/);
  assert.deepEqual(JSON.parse(manifest).start_url, "./");
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
