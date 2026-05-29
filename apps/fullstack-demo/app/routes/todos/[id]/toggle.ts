import { createRoute } from "hibana/factory";
import { toggleTodo } from "../../../../src/server/todos-store.ts";

// POST /todos/:id/toggle = toggle (form action)
export const POST = createRoute((c) => {
  const id = Number(c.req.param("id"));
  if (Number.isFinite(id)) toggleTodo(id);
  return c.redirect("/todos", 303);
});
