// hardcoded posts (step 1 = MVP)。 本格的には md ファイル + parser だが、 まずは
// 「server から page entry に渡す static data」 が file-based routing でどう書けるかを体感。
export type Post = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  body: string[];
};

const POSTS: Post[] = [
  {
    slug: "hello-mini-blog",
    title: "Hello, mini-blog",
    date: "2026-05-29",
    excerpt: "hibana で blog をボトムアップに作るシリーズの 1 記事目。",
    tags: ["meta", "intro"],
    body: [
      "mini-blog は hibana の dogfood サンプル。 fullstack-demo が full feature showcase だったので、 こちらは 1 機能ずつ積んで体感する側。",
      "step 1 = pure SSR の 2 route。 nav と footer は _layout.tsx で wrap、 記事一覧と詳細は hardcoded data から。 client JS は 0 byte。",
      "つまりこの記事を読むだけなら、 ブラウザは HTML を 1 つ受け取って終わり。 軽い。",
    ],
  },
  {
    slug: "file-routing-is-an-invention",
    title: "ファイル配置 = routing という発明",
    date: "2026-05-28",
    excerpt: "app/routes/posts/[slug].tsx と書けば /posts/:slug が生える。",
    tags: ["routing", "framework"],
    body: [
      "Next.js / Remix / HonoX 等で広まった file-based routing は、 「URL の構造 = ディレクトリの構造」 という整理。 grep するのが楽、 新人が読むのが楽、 IDE で「この URL の handler は？」 がワンクリック。",
      "hibana も同じ convention を借りた。 app/routes/posts/[slug].tsx を 1 ファイル置けば /posts/:slug が動く。 起動時に walkRoutes() が走査して、 setupHibana() が app.on(method, path, handler) を自動配線。",
      "configuration を書かない代わりに convention を覚える、 という典型的 trade。 hibana はこの trade を進化方向に乗せた。",
    ],
  },
  {
    slug: "zero-js-page-is-a-joy",
    title: "JS 0 byte のページが嬉しい",
    date: "2026-05-27",
    excerpt: "static な page は、 ただの HTML として配信される。 それで十分なことは多い。",
    tags: ["performance", "articulation"],
    body: [
      "この mini-blog の step 1 は、 全 page で JS を 1 byte も配信しない。 island がないので、 hibana の compiler は何も client bundle に焼かない。",
      "「動的にしたい部分だけ JS で書く」 = hibana の主軸方針。 ここから step 2 で 検索 box を 1 つ island として足したら、 その page だけ JS が出る。 他は static のまま。",
      "TTFB が短い、 bundle が薄い、 hosting が CDN だけで成立する。 引き算の力。",
    ],
  },
];

export type PostSummary = Omit<Post, "body">;

export function listPosts(): Post[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// 一覧 / 検索用 = body を落とす。 SearchBox island の data-props に焼き込まれる
// payload を絞る (= 一覧 page で body は使わない、 詳細 page で /posts/:slug
// が body を持つ Post を返す)。
export function listPostsForIndex(): PostSummary[] {
  return listPosts().map(({ body: _body, ...rest }) => rest);
}

// /tags/:tag 用。 server 側で filter してから render するので client JS は不要 (=
// SearchBox の動的 filter と対比的な「静的 filter」 の例)。
export function listPostsByTag(tag: string): PostSummary[] {
  return listPostsForIndex().filter((p) => p.tags.includes(tag));
}

export function findPost(slug: string): Post | null {
  return POSTS.find((p) => p.slug === slug) ?? null;
}
