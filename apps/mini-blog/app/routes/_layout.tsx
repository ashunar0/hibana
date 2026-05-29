// @ts-nocheck
// mini-blog の root layout。 全 route の HTML を header + main + footer で wrap。
export default component RootLayout(props) {
  <div class="max-w-2xl mx-auto px-4 py-8">
    <header>
      <h1 class="text-3xl font-bold tracking-tight">mini-blog</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">hibana で作る、 引き算の blog。</p>
      <nav class="mt-3">
        <a href="/" class="text-sm text-blue-600 dark:text-blue-400 hover:underline mr-3">home</a>
      </nav>
      <hr class="my-6 border-gray-200 dark:border-gray-700" />
    </header>
    <main>{props.children}</main>
    <footer>
      <hr class="mt-12 mb-4 border-gray-200 dark:border-gray-700" />
      <small class="text-xs text-gray-500 dark:text-gray-400">© mini-blog · powered by hibana</small>
    </footer>
  </div>
}
