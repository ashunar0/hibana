import { createRoute } from "hibana/factory";
import { jsx } from "hibana-core/jsx-runtime";

// MVP: <App/> island の placeholder を c.render に渡す。
// hibana middleware が server bundle 経由で renderIsland("App", {}) で焼き込む。
// 次 phase (T31) で c.render(<App/>) 形式 (hsx route) を扱う予定。
export default createRoute((c) => c.render(jsx("hbn-island", { name: "App", "data-props": "{}" })));
