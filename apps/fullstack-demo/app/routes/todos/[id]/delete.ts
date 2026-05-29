import { createRoute } from "hibana/factory";
import { deleteTodo } from "../../../../src/server/todos-store.ts";

const wantsJson = (c) => (c.req.header("Accept") ?? "").includes("application/json");

// POST /todos/:id/delete = delete (form action / fetch 両対応)
export const POST = createRoute((c) => {
  const id = Number(c.req.param("id"));
  const ok = Number.isFinite(id) ? deleteTodo(id) : false;
  if (wantsJson(c)) {
    return c.json({ id, deleted: ok });
  }
  return c.redirect("/todos", 303);
});
