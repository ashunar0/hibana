// mountIslands の MutationObserver path (async-appearing island の自動 hydrate)
// と idempotency guard をテスト。 happy-dom 環境前提 (vite.config.ts で environment 設定済)。
//
// dynamic import (`/assets/island-X.js` の load) は test 環境では fail するので、
// `interactive: false + el.firstElementChild あり` の static + SSR 済 path を使う
// (= 早期 return で data-hydrated を立てるだけの分岐、 import せず動く)。
// MutationObserver が新規 placeholder を拾って hydrateOne を発火することは
// `data-hydrated` attribute が立つかで検証できる。
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { mountIslands } from "../../src/island/loader.ts";

function mockManifestFetch(manifest: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/islands.json") {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("idempotency: 既に data-hydrated が立った placeholder は再 hydrate されない", async () => {
  mockManifestFetch({
    Foo: { source: "x", line: 0, props: [], interactive: false, chunk: "assets/island-Foo.js" },
  });

  // 既に data-hydrated 済の static + SSR'd 要素を置く
  document.body.innerHTML = `<hbn-island name="Foo" data-hydrated><span>foo</span></hbn-island>`;

  await mountIslands();

  // 既に hydrated なので何も変わらない (= 二重設定もエラーも無い)
  const el = document.querySelector("hbn-island")!;
  expect(el.hasAttribute("data-hydrated")).toBe(true);
  expect(el.innerHTML).toBe("<span>foo</span>");
});

test("MutationObserver: wave loop 後に追加された hbn-island も自動 hydrate される", async () => {
  mockManifestFetch({
    Late: { source: "x", line: 0, props: [], interactive: false, chunk: "assets/island-Late.js" },
  });

  // 初期は空 (= wave loop 即終了)、 MutationObserver が install される
  await mountIslands();

  // wave loop 終了後に SSR'd placeholder を後から追加
  const el = document.createElement("hbn-island");
  el.setAttribute("name", "Late");
  el.innerHTML = "<span>SSR'd</span>"; // firstElementChild あり = static path で hydrate される
  document.body.appendChild(el);

  // MutationObserver は microtask で発火
  await new Promise((r) => setTimeout(r, 20));

  expect(el.hasAttribute("data-hydrated")).toBe(true);
});

test("MutationObserver: descendant の placeholder も拾う (wrapper fragment 挿入 case)", async () => {
  mockManifestFetch({
    Inner: { source: "x", line: 0, props: [], interactive: false, chunk: "assets/island-Inner.js" },
  });

  await mountIslands();

  // wrapper div の中に placeholder を入れて一括挿入
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<p>before</p><hbn-island name="Inner"><span>SSR'd</span></hbn-island><p>after</p>`;
  document.body.appendChild(wrapper);

  await new Promise((r) => setTimeout(r, 20));

  const inner = document.querySelector('hbn-island[name="Inner"]')!;
  expect(inner.hasAttribute("data-hydrated")).toBe(true);
});

test("MutationObserver: data-hydrated 付きの新規挿入は再 hydrate されない", async () => {
  mockManifestFetch({
    Static: {
      source: "x",
      line: 0,
      props: [],
      interactive: false,
      chunk: "assets/island-Static.js",
    },
  });

  await mountIslands();

  const el = document.createElement("hbn-island");
  el.setAttribute("name", "Static");
  el.setAttribute("data-hydrated", "");
  el.innerHTML = "<span>preserved</span>";
  document.body.appendChild(el);

  await new Promise((r) => setTimeout(r, 20));

  // innerHTML が触られない = re-hydrate されてない
  expect(el.innerHTML).toBe("<span>preserved</span>");
  expect(el.hasAttribute("data-hydrated")).toBe(true);
});

test("MutationObserver: hbn-island 以外の要素挿入は無視される", async () => {
  mockManifestFetch({});

  await mountIslands();

  const div = document.createElement("div");
  div.textContent = "normal div";
  document.body.appendChild(div);

  await new Promise((r) => setTimeout(r, 20));

  // 何も変わらず、 エラーも出ない
  expect(div.textContent).toBe("normal div");
});
