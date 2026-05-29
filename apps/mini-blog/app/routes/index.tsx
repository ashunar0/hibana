// @ts-nocheck
import { createRoute } from "hibana/factory";
import { HomePage } from "../features/posts/HomePage.tsx";
import { listPosts } from "../features/posts/posts.ts";

// GET / = 記事一覧。 server で listPosts() を取って props 経由で page に渡すだけ。
export default createRoute((c) => c.render(<HomePage posts={listPosts()} />));
