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

  it("does not let a decomposed umlaut slip a duplicate past the check", async () => {
    // "A" plus kombinierendes Trema sieht aus wie "Ä", ist aber eine andere
    // Zeichenfolge. Ohne Normalisierung entstuenden zwei Kategorien, die in der
    // Oberflaeche identisch aussehen.
    await localTodoStore.addCategory("Ärzte", "#000000");

    await expect(localTodoStore.addCategory("A\u0308rzte", "#111111")).rejects.toThrow(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );
  });

  it("stores a decomposed name in its composed form", async () => {
    const created = await localTodoStore.addCategory("A\u0308rzte", "#000000");
    expect(created.name).toBe("Ärzte");
    expect(await localTodoStore.addCategory("Ärzte", "#111111").catch((e) => e.message)).toBe(
      'Es gibt bereits eine Kategorie "Ärzte".'
    );
  });

  it("creates a todo without a description by default", async () => {
    const todo = await localTodoStore.addTodo("Ohne Text", "medium", null);

    expect(todo.description).toBe("");
  });

  it("stores a description given at creation time", async () => {
    const todo = await localTodoStore.addTodo("Mit Text", "medium", null, null, "Zeile eins\nZeile zwei");

    expect(todo.description).toBe("Zeile eins\nZeile zwei");
    const [listed] = await localTodoStore.listTodos();
    expect(listed.description).toBe("Zeile eins\nZeile zwei");
  });

  it("reads a legacy entry without the field as an empty description", async () => {
    localStorage.setItem(
      "todolist_todos",
      JSON.stringify([
        {
          id: 1,
          title: "Alt",
          done: false,
          status: "todo",
          priority: "medium",
          created_at: "2026-01-01T00:00:00.000Z",
          due_date: null,
          category_id: null,
          category_name: null,
          category_color: null,
        },
      ]),
    );

    const [todo] = await localTodoStore.listTodos();

    expect(todo.description).toBe("");
  });

  describe("updateTodoFields", () => {
    it("changes a single field and leaves the rest alone", async () => {
      const todo = await localTodoStore.addTodo("Titel", "medium", "2026-09-20");

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        description: "Neuer Text",
      });

      expect(updated.description).toBe("Neuer Text");
      expect(updated.title).toBe("Titel");
      expect(updated.priority).toBe("medium");
      expect(updated.due_date).toBe("2026-09-20");
    });

    it("changes several fields at once", async () => {
      const todo = await localTodoStore.addTodo("Alt", "low", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        title: "Neu",
        description: "Text",
        priority: "high",
        dueDate: "2026-10-01",
      });

      expect(updated).toMatchObject({
        title: "Neu",
        description: "Text",
        priority: "high",
        due_date: "2026-10-01",
      });
    });

    it("clears the due date and the category with null", async () => {
      const category = await localTodoStore.addCategory("Arbeit", "#7cc3f7");
      const todo = await localTodoStore.addTodo("Titel", "medium", "2026-09-20", category.id);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        dueDate: null,
        categoryId: null,
      });

      expect(updated.due_date).toBeNull();
      expect(updated.category_id).toBeNull();
      expect(updated.category_name).toBeNull();
      expect(updated.category_color).toBeNull();
    });

    it("denormalises name and colour when the category changes", async () => {
      const category = await localTodoStore.addCategory("Arbeit", "#7cc3f7");
      const todo = await localTodoStore.addTodo("Titel", "medium", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {
        categoryId: category.id,
      });

      expect(updated.category_name).toBe("Arbeit");
      expect(updated.category_color).toBe("#7cc3f7");
    });

    it("clears a description with the empty string rather than skipping the field", async () => {
      const todo = await localTodoStore.addTodo("Titel", "medium", null);
      await localTodoStore.updateTodoFields(todo.id, { description: "Text" });

      const updated = await localTodoStore.updateTodoFields(todo.id, { description: "" });

      expect(updated.description).toBe("");
    });

    it("returns the todo unchanged for an empty patch", async () => {
      const todo = await localTodoStore.addTodo("Titel", "medium", null);

      const updated = await localTodoStore.updateTodoFields(todo.id, {});

      expect(updated).toEqual(todo);
    });

    it("rejects an unknown id", async () => {
      await expect(localTodoStore.updateTodoFields(999, { title: "Neu" })).rejects.toThrow(
        "Todo 999 not found",
      );
    });
  });

  describe("der Papierkorb im localStorage-Store", () => {
    it("nimmt eine gelöschte Aufgabe aus der Liste, behält sie aber gespeichert", async () => {
      const todo = await localTodoStore.addTodo("Weg damit", "medium", null);

      await localTodoStore.deleteTodo(todo.id);

      expect(await localTodoStore.listTodos()).toEqual([]);
      const raw = JSON.parse(localStorage.getItem("todolist_todos") ?? "[]");
      expect(raw).toHaveLength(1);
      expect(raw[0].deleted_at).toEqual(expect.any(String));
    });

    it("gibt eine Aufgabe ohne den internen Zeitstempel heraus", async () => {
      const todo = await localTodoStore.addTodo("Bleibt", "medium", null);

      const [listed] = await localTodoStore.listTodos();

      expect(listed).toEqual(todo);
      expect("deleted_at" in listed).toBe(false);
    });

    it("nimmt auch einer Aufgabe im Papierkorb die gelöschte Kategorie", async () => {
      const kategorie = await localTodoStore.addCategory("Kunde", "#111111");
      const todo = await localTodoStore.addTodo("Weg damit", "medium", null, kategorie.id);
      await localTodoStore.deleteTodo(todo.id);

      await localTodoStore.deleteCategory(kategorie.id);

      const raw = JSON.parse(localStorage.getItem("todolist_todos") ?? "[]");
      expect(raw[0].category_id).toBeNull();
      expect(raw[0].deleted_at).toEqual(expect.any(String));
    });

    it("behandelt eine Aufgabe im Papierkorb wie eine unbekannte Id", async () => {
      const todo = await localTodoStore.addTodo("Weg damit", "medium", null);
      await localTodoStore.deleteTodo(todo.id);

      await expect(localTodoStore.toggleTodoDone(todo.id, true)).rejects.toThrow(
        `Todo ${todo.id} not found`
      );
      await expect(localTodoStore.updateTodoPriority(todo.id, "high")).rejects.toThrow(
        `Todo ${todo.id} not found`
      );
    });
  });
});
