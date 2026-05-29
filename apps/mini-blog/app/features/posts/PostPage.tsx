// @ts-nocheck
// /posts/[slug] page。 server から find した post 1 件 + 現在の likes を受けて render。
// PostPage 自体は signal を持たないので static (= 親 page entry)。
// LikeButton だけが interactive 判定で per-island chunk になる。
import { LikeButton } from "./LikeButton.tsx";

export component PostPage(props) {
  <article>
    <header class="mb-6">
      <h2 class="text-2xl font-bold">{props.post.title}</h2>
      <time class="text-xs text-gray-500 dark:text-gray-400">{props.post.date}</time>
      <ul class="mt-2 flex flex-wrap gap-2 list-none p-0">
        @{ for (const tag of props.post.tags) {
          <li>
            <a
              href={"/tags/" + tag}
              class="inline-block text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:underline"
            >
              #{tag}
            </a>
          </li>
        } }
      </ul>
    </header>
    <div class="space-y-4 leading-relaxed">
      @{ for (const para of props.post.body) {
        <p>{para}</p>
      } }
    </div>
    <LikeButton slug={props.post.slug} initialCount={props.likes} />
    <p class="mt-8">
      <a href="/" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">← home</a>
    </p>
  </article>
}
