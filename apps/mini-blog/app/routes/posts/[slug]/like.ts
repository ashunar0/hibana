// @ts-nocheck
import { createRoute } from "hibana/factory";
import { incrementLike } from "../../../features/posts/likes-store.ts";

// POST /posts/:slug/like = like を 1 増やす。
// JS on path (Accept: application/json) → {count} を JSON で返す (= Mutation の fetch 用)。
// JS off path (default) → /posts/:slug に 303 redirect (= 詳細 page 再 SSR で新 count 反映)。
// 同じ handler が両 mode 動く = hibana の主軸 articulation。
const wantsJson = (c) => (c.req.header("Accept") ?? "").includes("application/json");

export const POST = createRoute((c) => {
  const slug = c.req.param("slug");
  const count = incrementLike(slug);
  if (wantsJson(c)) {
    return c.json({ count });
  }
  return c.redirect("/posts/" + slug, 303);
});
