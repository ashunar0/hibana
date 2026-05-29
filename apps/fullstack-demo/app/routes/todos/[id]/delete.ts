import { createRoute } from "hibana/factory";
import { deleteTodo } from "../../../../src/server/todos-store.ts";

// POST /todos/:id/delete = delete (form action)
export const POST = createRoute((c) => {
  const id = Number(c.req.param("id"));
  if (Number.isFinite(id)) deleteTodo(id);
  return c.redirect("/todos", 303);
});
