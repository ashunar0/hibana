// @ts-nocheck
import { createRoute } from "hibana/factory";
import { HomePage } from "../features/posts/HomePage.tsx";
import { listPostsForIndex } from "../features/posts/posts.ts";

// GET / = 記事一覧。 SearchBox island の data-props に焼き込むので、 body を
// 落とした summary 型 (= listPostsForIndex) を渡して client 配信 payload を絞る。
export default createRoute((c) => c.render(<HomePage posts={listPostsForIndex()} />));
