// @ts-nocheck
// SearchBox island = home page で記事を title / excerpt で絞り込む。
//
// 主軸方針: 動的なら JS で書く。
// - props.initialPosts は server-rendered の posts 配列 (= HomePage 経由で
//   data-props に焼き込まれ、 hydrate 時に mountIslands が JSON.parse で復元)
// - query は Signal、 input の onInput で更新、 @{ for } 内で query.value を
//   read することで tracking → filter 結果が再評価される
// - JS off 時 = SearchBox が hydrate されないので、 SSR 時点の filtered() (=
//   query="" = 全件) がそのまま表示。 検索は効かないが list は見える fallback
import { Signal } from "hibana-core";

export component SearchBox(props) {
  const query = new Signal("");

  const filtered = () => {
    const q = query.value.toLowerCase().trim();
    if (!q) return props.initialPosts;
    return props.initialPosts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q),
    );
  };

  <div>
    <input
      type="search"
      placeholder="title / excerpt を検索..."
      onInput={(e) => (query.value = e.currentTarget.value)}
      class="w-full px-3 py-2 mb-4 border border-gray-300 dark:border-gray-700 rounded bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <ul class="space-y-3">
      @{ for (const post of filtered()) {
        <li class="border-b border-dotted border-gray-300 dark:border-gray-700 pb-3">
          <a
            href={"/posts/" + post.slug}
            class="text-lg font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {post.title}
          </a>
          <time class="ml-2 text-xs text-gray-500 dark:text-gray-400">{post.date}</time>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{post.excerpt}</p>
        </li>
      } }
    </ul>
    @{ if (filtered().length === 0) {
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-3">該当する記事がないのだ。</p>
    } }
  </div>
}
