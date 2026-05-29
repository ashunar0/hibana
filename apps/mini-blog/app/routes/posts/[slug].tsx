// @ts-nocheck
import { createRoute } from "hibana/factory";
import { PostPage } from "../../features/posts/PostPage.tsx";
import { findPost } from "../../features/posts/posts.ts";

// GET /posts/:slug = 記事詳細。 slug で hit しない → 404 (= Hono default)。
export default createRoute((c) => {
  const slug = c.req.param("slug");
  const post = findPost(slug);
  if (!post) return c.notFound();
  return c.render(<PostPage post={post} />);
});
