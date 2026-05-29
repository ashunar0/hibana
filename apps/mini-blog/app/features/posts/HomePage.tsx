// @ts-nocheck
// / (home) page。 記事一覧を server から受け取って ul で並べる。
// props.posts = server (= app/routes/index.tsx) から渡される、 client JS は 0 byte。
export component HomePage(props) {
  <section>
    <h2 class="text-xl font-semibold mb-4">記事一覧</h2>
    <ul class="space-y-3">
      @{ for (const post of props.posts) {
        <li class="border-b border-dotted border-gray-300 dark:border-gray-700 pb-3">
          <a href={"/posts/" + post.slug} class="text-lg font-medium text-blue-600 dark:text-blue-400 hover:underline">
            {post.title}
          </a>
          <time class="ml-2 text-xs text-gray-500 dark:text-gray-400">{post.date}</time>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{post.excerpt}</p>
        </li>
      } }
    </ul>
  </section>
}
