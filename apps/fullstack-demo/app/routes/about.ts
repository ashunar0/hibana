import { createRoute } from "hibana/factory";
import { jsx } from "hibana-core/jsx-runtime";

// 静的 island なし route の例。 c.render に Node を直接渡せば middleware が
// HTML template (= doctype + head + body) で wrap する。
export default createRoute((c) =>
  c.render(
    jsx("section", {
      children: [
        jsx("h1", { children: "About" }),
        jsx("p", { children: "fullstack-demo の static page (no islands)。" }),
        jsx("p", {
          children: jsx("a", { href: "/", children: "← home" }),
        }),
      ],
    }),
  ),
);
