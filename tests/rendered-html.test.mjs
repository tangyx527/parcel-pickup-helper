import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the parcel pickup app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html[^>]*lang="zh-CN"/i);
  assert.match(html, /<title>拿快递 · 我的取件清单<\/title>/i);
  assert.match(html, /新增快递/);
  assert.match(html, /待拿/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("includes installable offline assets", async () => {
  const [manifest, serviceWorker, page] = await Promise.all([
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(serviceWorker, /caches\.open/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /SKIP_WAITING/);
  assert.match(page, /保存并继续/);
  assert.match(page, /addEventListener\("storage"/);
  assert.match(page, /本机访客模式/);
  assert.match(page, /UNDO_TOAST_MS = 2_000/);
  assert.doesNotMatch(page, /8 秒内撤销/);
});
