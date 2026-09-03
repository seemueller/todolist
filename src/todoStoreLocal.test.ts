import { describe, it, expect, beforeEach } from "vitest";
import { localTodoStore } from "./todoStoreLocal";

describe("localTodoStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores a todo and reads it back", async () => {
    const created = await localTodoStore.addTodo("Schreiben", "high", null, null);
    expect(created.title).toBe("Schreiben");
    expect(created.status).toBe("todo");
    expect(created.done).toBe(false);

    const all = await localTodoStore.listTodos();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
  });

  it("keeps done and status consistent", async () => {
    const created = await localTodoStore.addTodo("Testen", "low", null, null);
    const updated = await localTodoStore.updateTodoStatus(created.id, "done");
    expect(updated.done).toBe(true);

    const back = await localTodoStore.updateTodoStatus(created.id, "in_progress");
    expect(back.done).toBe(false);
  });

  it("denormalises the category name onto the todo", async () => {
    const cat = await localTodoStore.addCategory("Kunde", "#a78bfa");
    const todo = await localTodoStore.addTodo("Meeting", "medium", null, cat.id);
    expect(todo.category_name).toBe("Kunde");
    expect(todo.category_color).toBe("#a78bfa");
  });
});
