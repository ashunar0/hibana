import { Hono } from "hono";
import { jsx } from "hibana-core/jsx-runtime";
import { clearLayout, registerIsland, registerLayout } from "hibana-compiler/ssr";
import { afterEach, expect, test } from "vite-plus/test";
import { hibana } from "../src/server.ts";

afterEach(() => {
  clearLayout();
});

function createApp(options?: Parameters<typeof hibana>[0]) {
  const app = new Hono();
  app.use("*", hibana(options));
  return app;
}

test("c.render(Element) wraps outerHTML into doctype html template", async () => {
  const app = createApp();
  app.get("/", (c) => c.render(jsx("h1", { children: "Hello" })));

  const res = await app.request("/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");

  const html = await res.text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain('<html lang="en">');
  expect(html).toContain("<h1>Hello</h1>");
  expect(html).toContain("</body></html>");
});

test("c.render(string) is accepted as-is for inner body", async () => {
  const app = createApp();
  app.get("/raw", (c) => c.render("<section>raw</section>"));

  const res = await app.request("/raw");
  const html = await res.text();
  expect(html).toContain("<body><section>raw</section></body>");
});

test("default head includes client entry script and manifest preload", async () => {
  const app = createApp();
  app.get("/", (c) => c.render(jsx("div", {})));

  const html = await (await app.request("/")).text();
  expect(html).toContain('<script type="module" src="/assets/main.js">');
  expect(html).toContain('<link rel="modulepreload" href="/assets/main.js">');
  expect(html).toContain('<link rel="preload" href="/islands.json" as="fetch"');
});

test("options override clientEntry / manifestPath / lang", async () => {
  const app = createApp({
    clientEntry: "/build/entry.js",
    manifestPath: "/build/islands.json",
    lang: "ja",
  });
  app.get("/", (c) => c.render(jsx("p", {})));

  const html = await (await app.request("/")).text();
  expect(html).toContain('<html lang="ja">');
  expect(html).toContain('src="/build/entry.js"');
  expect(html).toContain('href="/build/islands.json"');
});

test("self が <hbn-island name> なら registry の component を呼んで innerHTML を埋める", async () => {
  registerIsland("TestHello", () => jsx("p", { children: "hello from island" }));
  const app = createApp();
  const island = jsx("hbn-island", { name: "TestHello", "data-props": "{}" });
  app.get("/", (c) => c.render(island));

  const html = await (await app.request("/")).text();
  expect(html).toContain(
    '<hbn-island name="TestHello" data-props="{}"><p>hello from island</p></hbn-island>',
  );
});

test("descendant <hbn-island name> も registry 経由で埋める + data-props を JSON parse", async () => {
  registerIsland("TestGreet", (props) =>
    jsx("p", { children: `Hi, ${(props as { name: string }).name}!` }),
  );
  const app = createApp();
  const page = jsx("main", {
    children: jsx("hbn-island", {
      name: "TestGreet",
      "data-props": '{"name":"あさひ"}',
    }),
  });
  app.get("/", (c) => c.render(page));

  const html = await (await app.request("/")).text();
  expect(html).toContain(
    '<main><hbn-island name="TestGreet" data-props="{&quot;name&quot;:&quot;あさひ&quot;}"><p>Hi, あさひ!</p></hbn-island></main>',
  );
});

test("registry にない island name は空のまま (= silent skip)", async () => {
  const app = createApp();
  const island = jsx("hbn-island", { name: "NotRegistered", "data-props": "{}" });
  app.get("/", (c) => c.render(island));

  const html = await (await app.request("/")).text();
  expect(html).toContain('<hbn-island name="NotRegistered" data-props="{}"></hbn-island>');
});

test("nested element produces correct outerHTML", async () => {
  const app = createApp();
  app.get("/", (c) =>
    c.render(
      jsx("main", {
        children: jsx("article", {
          children: [jsx("h2", { children: "T" }), jsx("p", { children: "body" })],
        }),
      }),
    ),
  );

  const html = await (await app.request("/")).text();
  expect(html).toContain("<main><article><h2>T</h2><p>body</p></article></main>");
});

test("layout が登録されてれば content を children として wrap する", async () => {
  // layout = (props) => <div class="wrap"><header>nav</header>{props.children}<footer>©</footer></div>
  // oxlint-disable-next-line typescript/no-explicit-any -- jsx の children 型に props.children を渡すための test 内 cast
  const Layout = (props: { children: any }) =>
    jsx("div", {
      class: "wrap",
      children: [
        jsx("header", { children: "nav" }),
        props.children,
        jsx("footer", { children: "©" }),
      ],
    });
  registerLayout({ default: Layout });

  const app = createApp();
  app.get("/", (c) => c.render(jsx("h1", { children: "page" })));

  const html = await (await app.request("/")).text();
  expect(html).toContain(
    '<div class="wrap"><header>nav</header><h1>page</h1><footer>©</footer></div>',
  );
});

test("layout なし時は content をそのまま wrap (= 既存挙動)", async () => {
  // clearLayout は afterEach で実行、 ここでは layout 未登録の状態
  const app = createApp();
  app.get("/", (c) => c.render(jsx("h1", { children: "no layout" })));

  const html = await (await app.request("/")).text();
  expect(html).toContain("<body><h1>no layout</h1></body>");
});
