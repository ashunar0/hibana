// @ts-nocheck
import { createRoute } from "hibana/factory";
import { getLikes } from "../../features/posts/likes-store.ts";
import { PostPage } from "../../features/posts/PostPage.tsx";
import { findPost } from "../../features/posts/posts.ts";

// GET /posts/:slug = 記事詳細。 slug で hit しない → 404 (= Hono default)。
// likes は in-memory store から取って LikeButton の initialCount に bridge。
export default createRoute((c) => {
  const slug = c.req.param("slug");
  const post = findPost(slug);
  if (!post) return c.notFound();
  const likes = getLikes(slug);
  return c.render(<PostPage post={post} likes={likes} />);
});
