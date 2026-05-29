import { createRoute } from "hibana/factory";
import { toggleTodo } from "../../../../src/server/todos-store.ts";

const wantsJson = (c) => (c.req.header("Accept") ?? "").includes("application/json");

// POST /todos/:id/toggle = toggle (form action / fetch 両対応)
export const POST = createRoute((c) => {
  const id = Number(c.req.param("id"));
  const todo = Number.isFinite(id) ? toggleTodo(id) : null;
  if (wantsJson(c)) {
    return c.json({ todo });
  }
  return c.redirect("/todos", 303);
});
