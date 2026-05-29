// @ts-nocheck
import { createRoute } from "hibana/factory";
import { TagListPage } from "../../features/posts/TagListPage.tsx";
import { listPostsByTag } from "../../features/posts/posts.ts";

// GET /tags/:tag = タグ filter された一覧。 server 側で filter してから
// TagListPage に渡す = 「動的 filter は不要、 URL ごとに固定の SSR で済む」 例。
// SearchBox (= client signal filter) と対比する articulation。
export default createRoute((c) => {
  const tag = c.req.param("tag");
  const posts = listPostsByTag(tag);
  return c.render(<TagListPage tag={tag} posts={posts} />);
});
