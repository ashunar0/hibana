// Island mount loader: `<hbn-island name="Foo" data-props="...">` を全部探して、
// manifest (`/islands.json`) から chunk URL を引いて dynamic import → 該当 component を
// Fragment 経由で render → placeholder を replaceWith。
//
// chunk フィールド有 (= build): production の hashed asset URL を使う。
// chunk フィールド無 (= dev): Vite virtual module URL (`/@id/__x00__virtual:hibana-island/<Name>`)
// を fallback で使い、 vite-plugin の load hook が source ファイルの default re-export を返す。

import { Fragment, jsx } from "../renderer/jsx.ts";

interface IslandManifestEntry {
  source: string;
  line: number;
  props: string[];
  chunk?: string;
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

  const placeholders = Array.from(document.querySelectorAll<HTMLElement>("hbn-island[name]"));
  await Promise.all(
    placeholders.map(async (el) => {
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

      // Fragment で wrap して child slot で reactive binding を起動。
      // component の末尾 thunk は jsx runtime の T9.6 reactive Node-child 経路で
      // 初回 render + 以降の effect 更新が組まれる。
      const wrapper = jsx(Fragment, {
        children: jsx(Component as (p: Record<string, unknown>) => Node, props),
      });
      el.replaceWith(wrapper);
    }),
  );
}
