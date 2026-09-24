import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the FlyLab experiment surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FlyLab — アリの自律生態系シミュレータ<\/title>/i);
  assert.match(html, /小さな世界の/);
  assert.match(html, /アリの自律生態系シミュレーション/);
  assert.match(html, /生存数の推移/);
  assert.match(html, /累計出生/);
  assert.match(html, /累計死亡/);
  assert.match(html, /餓死/);
  assert.match(html, /絶滅後の自動リセットはありません/);
  assert.doesNotMatch(html, /餌を置く|壁を描く|匂いをすべて消す/);
  assert.match(html, /局所ルールで動くマルチエージェントモデル/);
  assert.match(html, /実験開始/);
  assert.match(html, /実験記録/);
  assert.match(html, /ハエに解かせる/);
  assert.match(html, /迷路を編集/);
  assert.match(html, /深さ優先探索の補助ルール/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships product metadata and no disposable starter UI", async () => {
  const [page, layout, packageJson, ogStat, ogBytes] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/ant-og.png", import.meta.url)),
    readFile(new URL("../public/ant-og.png", import.meta.url)),
  ]);

  assert.match(page, /<FlyLab \/>/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.ok(ogStat.size > 100_000);
  assert.deepEqual([...ogBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
