// Island mount loader: `<hbn-island name="Foo" data-props="...">` を全部探して、
// manifest (`/islands.json`) から chunk URL を引いて dynamic import → component を mount。
//
// 4 つの分岐 (interactive × SSR 済の組み合わせ):
//   - interactive + SSR 済 (build 時 closeBundle で焼き込まれた、 `el.firstElementChild` あり):
//     hydrateInto で hydrate モード起動 → 既存 DOM tree に event handler と signal binding
//     effect だけ attach、 DOM churn / flicker なし (design.md §9 Solid 流)
//   - interactive + 非 SSR (dev / 空 placeholder): 従来通り Fragment で wrap → `el.replaceWith(wrapper)`
//     で再 render
//   - static + SSR 済: mount 不要、 SSR HTML を放置して JS 0 byte shipping。 `data-hydrated`
//     を立てるだけで wave loop から除外する
//   - static + 非 SSR (dev): client で 1 回 render する fallback (dev では SSR されないので
//     何か出さないと空白になる)
//
// hydrate 済の `<hbn-island>` には `data-hydrated` 属性を立てて再 hydrate を防ぐ
// (hydrate モードでは `<hbn-island>` 自体が DOM に残るため、 querySelectorAll が
// 同じ要素を毎 wave で拾うのを回避)。
//
// chunk フィールド有 (= build): production の hashed asset URL を使う。
// chunk フィールド無 (= dev): Vite virtual module URL (`/@id/__x00__virtual:hibana-island/<Name>`)
// を fallback で使い、 vite-plugin の load hook が source ファイルの default re-export を返す。

import { Fragment, hydrateInto, jsx } from "../renderer/jsx.ts";

interface IslandManifestEntry {
  source: string;
  line: number;
  props: string[];
  chunk?: string;
  interactive?: boolean;
  reasons?: string[];
}

type IslandManifest = Record<string, IslandManifestEntry>;

export interface MountIslandsOptions {
  manifestUrl?: string;
}

export async function mountIslands(opts: MountIslandsOptions = {}): Promise<void> {
  const manifestUrl = opts.manifestUrl ?? "/islands.json";

  let manifest: IslandManifest;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      console.error(`[hibana] failed to fetch manifest ${manifestUrl}: ${res.status}`);
      return;
    }
    manifest = (await res.json()) as IslandManifest;
  } catch (e) {
    console.error(`[hibana] failed to fetch manifest ${manifestUrl}`, e);
    return;
  }

  // wave 単位で繰り返す (初期の sync nesting 対応):
  //   - replaceWith path (非 SSR): el が DOM から消えて中身が新規 placeholder を含む可能性
  //   - hydrate path (SSR 済): el は残るが `data-hydrated` を立てて selector で除外、
  //     hydrate 中に jsx で子 `<hbn-island>` element を採用するが内部は触らない
  //     → 次 wave で child placeholder を見つけて hydrate
  // どちらも「対象が無くなったら break」 で収束する。 階層深度 10 で打ち切り (安全弁)。
  for (let i = 0; i < 10; i++) {
    const placeholders = Array.from(
      document.querySelectorAll<HTMLElement>("hbn-island[name]:not([data-hydrated])"),
    );
    if (placeholders.length === 0) break;
    await Promise.all(placeholders.map((el) => hydrateOne(el, manifest)));
  }

  // async-appearing islands (= Resource fetch 後に親 island が <hbn-island/> を追加する等)
  // を持続監視。 MutationObserver で childList + subtree、 新規 placeholder を見つけたら
  // hydrateOne を発火。 wave loop 終了後の async path 専用なので disconnect しない (page lifetime)。
  observeAsyncIslands(manifest);
}

function observeAsyncIslands(manifest: IslandManifest): void {
  // SSR / vitest 等で MutationObserver が無い環境では何もしない (= 既存挙動維持)
  if (typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;
        // self が placeholder
        if (
          node.tagName.toLowerCase() === "hbn-island" &&
          node.hasAttribute("name") &&
          !node.hasAttribute("data-hydrated")
        ) {
          void hydrateOne(node as HTMLElement, manifest);
        }
        // descendant placeholder も拾う (= まとめて wrapper fragment が挿入される case)
        const inner = (node as Element).querySelectorAll?.<HTMLElement>(
          "hbn-island[name]:not([data-hydrated])",
        );
        if (inner) {
          for (const el of Array.from(inner)) void hydrateOne(el, manifest);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function hydrateOne(el: HTMLElement, manifest: IslandManifest): Promise<void> {
  // idempotency guard: wave loop と MutationObserver の両方が同じ element を拾う race を防ぐ。
  // hydrateInto が二重に走ると event handler が重複 attach される。
  if (el.hasAttribute("data-hydrated")) return;
  const name = el.getAttribute("name");
  if (!name) return;
  const entry = manifest[name];
  if (!entry) {
    console.warn(`[hibana] island "${name}" not found in manifest; skipping`);
    return;
  }
  const propsAttr = el.getAttribute("data-props");
  let props: Record<string, unknown> = {};
  if (propsAttr) {
    try {
      props = JSON.parse(propsAttr) as Record<string, unknown>;
    } catch (e) {
      console.warn(`[hibana] island "${name}": invalid data-props JSON, using {}`, e);
    }
  }

  // static + SSR 済: SSR HTML を放置、 client JS shipping ゼロ。 wave loop から除外する
  // ために `data-hydrated` だけ立てて return (dynamic import 自体させない)。
  if (entry.interactive === false && el.firstElementChild) {
    el.setAttribute("data-hydrated", "");
    return;
  }

  const url = entry.chunk
    ? `/${entry.chunk}`
    : `/@id/__x00__virtual:hibana-island/${encodeURIComponent(name)}`;

  try {
    await import(/* @vite-ignore */ url);
  } catch (e) {
    console.error(`[hibana] island "${name}": failed to import ${url}`, e);
    return;
  }
  // chunk は side-effect で globalThis registry に component を登録する
  // (vite-plugin の virtual module load を参照)。 default export 経路だと
  // Rolldown の tree-shake で消えるため、 registry 方式に統一。
  const registry = (globalThis as Record<symbol, Record<string, unknown> | undefined>)[
    Symbol.for("hibana.islands")
  ];
  const Component = registry?.[name];
  if (typeof Component !== "function") {
    console.warn(`[hibana] island "${name}": not found in registry after import`);
    return;
  }

  // SSR 済 (中身が焼き込まれてる) なら hydrate モードで既存 DOM を引き継ぐ。
  // 空 placeholder (dev or 非 SSR build) なら従来の replaceWith fallback。
  // 再 hydrate 防止のため処理開始前に data-hydrated を立てる。
  if (el.firstElementChild) {
    el.setAttribute("data-hydrated", "");
    hydrateInto(el, () => {
      jsx(Component as (p: Record<string, unknown>) => Node, props);
    });
    return;
  }

  // Fragment で wrap して child slot で reactive binding を起動。
  // component の末尾 thunk は jsx runtime の T9.6 reactive Node-child 経路で
  // 初回 render + 以降の effect 更新が組まれる。
  const wrapper = jsx(Fragment, {
    children: jsx(Component as (p: Record<string, unknown>) => Node, props),
  });
  el.replaceWith(wrapper);
}
