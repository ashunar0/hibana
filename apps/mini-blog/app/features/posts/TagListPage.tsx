// @ts-nocheck
// /tags/[tag] page。 server 側で filter された posts を受けて static SSR で並べる。
// SearchBox と違って signal も event handler もないので interactive: false 判定、
// client JS は出ない (= JS 0 byte page、 一覧 page で動的 filter が要らない例)。
export component TagListPage(props) {
  <section>
    <h2 class="text-xl font-semibold mb-4">
      タグ: <span class="text-blue-600 dark:text-blue-400">#{props.tag}</span>
      <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">({props.posts.length} 件)</span>
    </h2>
    <ul class="space-y-3">
      @{ for (const post of props.posts) {
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
    @{ if (props.posts.length === 0) {
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-3">このタグに該当する記事はないのだ。</p>
    } }
    <p class="mt-8">
      <a href="/" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">← home</a>
    </p>
  </section>
}
