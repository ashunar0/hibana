// @ts-nocheck
import { createRoute } from "hibana/factory";
import { TodoListSpaPage } from "../../src/TodoListSpaPage.tsx";

// GET /todos-spa = TodoList SPA mode page (= 初期 data 無しで page を返す、
// 中の TodoListSpa island が client Resource で /todos JSON 取得)
export default createRoute((c) => c.render(<TodoListSpaPage />));
