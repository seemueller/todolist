import { describe, it, expect, beforeEach } from "vitest";
import { localTodoStore } from "./todoStoreLocal";
import { localTimeStore } from "./timeStoreLocal";

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

  it("rejects rather than throwing synchronously for a missing todo", async () => {
    // A synchronous throw would escape here before the assertion ever runs,
    // which is exactly the difference from the SQL store we are closing.
    await expect(localTodoStore.updateTodoTitle(999, "x")).rejects.toThrow("Todo 999 not found");
  });

  it("clears the category off a todo when its category is deleted", async () => {
    const cat = await localTodoStore.addCategory("Kunde", "#a78bfa");
    const todo = await localTodoStore.addTodo("Meeting", "medium", null, cat.id);

    await localTodoStore.deleteCategory(cat.id);

    const [reloaded] = await localTodoStore.listTodos();
    expect(reloaded.id).toBe(todo.id);
    expect(reloaded.category_id).toBeNull();
    expect(reloaded.category_name).toBeNull();
    expect(reloaded.category_color).toBeNull();
  });

  it("keeps time bookings when their category is deleted", async () => {
    const cat = await localTodoStore.addCategory("Kunde", "#a78bfa");
    await localTimeStore.paintSlots("2026-09-03", [32, 33], cat.id);
    await localTimeStore.setBlockNote("2026-09-03", 32, "Meeting");

    await localTodoStore.deleteCategory(cat.id);

    // Die Buchung ueberlebt mitsamt ihrer jetzt ins Leere zeigenden
    // category_id; die Wochenansicht beschriftet sie mit "Geloeschte
    // Kategorie". Der Desktop-Build muss das seit Migration 9 genauso tun.
    const day = await localTimeStore.listSlots("2026-09-03");
    expect(day).toEqual([
      { slot: 32, category_id: cat.id, note: "Meeting" },
      { slot: 33, category_id: cat.id, note: "Meeting" },
    ]);
  });

  it("sorts categories the way German readers expect", async () => {
    await localTodoStore.addCategory("Zebra", "#000000");
    await localTodoStore.addCategory("Apfel", "#000000");
    await localTodoStore.addCategory("Ärzte", "#000000");

    const names = (await localTodoStore.listCategories()).map((c) => c.name);
    expect(names).toEqual(["Apfel", "Ärzte", "Zebra"]);
  });

  it("sorts case-insensitively across mixed initial case, not just by locale", async () => {
    // A bare localeCompare would pass with Apfel/Ärzte/Zebra above but still
    // fail here: WebKitGTK groups every uppercase-initial name before every
    // lowercase-initial one, so "Ärzte" (uppercase) would sort before
    // "apfel" and "sport" (lowercase) instead of between them.
    await localTodoStore.addCategory("Zebra", "#000000");
    await localTodoStore.addCategory("apfel", "#000000");
    await localTodoStore.addCategory("Ärzte", "#000000");
    await localTodoStore.addCategory("sport", "#000000");

    const names = (await localTodoStore.listCategories()).map((c) => c.name);
    expect(names).toEqual(["apfel", "Ärzte", "sport", "Zebra"]);
  });

  it("rejects creating a category whose name collides case-insensitively", async () => {
    await localTodoStore.addCategory("Ärzte", "#000000");

    await expect(localTodoStore.addCategory("ärzte", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    const names = (await localTodoStore.listCategories()).map((c) => c.name);
    expect(names).toEqual(["Ärzte"]);
  });

  it("allows creating a genuinely new category name", async () => {
    await localTodoStore.addCategory("Ärzte", "#000000");
    const created = await localTodoStore.addCategory("Sport", "#111111");
    expect(created.name).toBe("Sport");
  });

  it("allows renaming a category to its own current name in a different case", async () => {
    const cat = await localTodoStore.addCategory("Ärzte", "#000000");
    const updated = await localTodoStore.updateCategory(cat.id, "ärzte", "#111111");
    expect(updated.name).toBe("ärzte");
    expect(updated.color).toBe("#111111");
  });

  it("rejects renaming a category to another category's name", async () => {
    await localTodoStore.addCategory("Ärzte", "#000000");
    const sport = await localTodoStore.addCategory("Sport", "#111111");

    await expect(localTodoStore.updateCategory(sport.id, "ärzte", "#222222")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );

    const reloaded = await localTodoStore.listCategories();
    expect(reloaded.find((c) => c.id === sport.id)?.name).toBe("Sport");
  });

  it("does not let leading or trailing whitespace slip a duplicate past the check", async () => {
    await localTodoStore.addCategory("Ärzte", "#000000");

    await expect(localTodoStore.addCategory("  ärzte  ", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );
  });
});
