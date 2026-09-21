import { test, expect } from "@playwright/test";

test.describe("TodoList App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to be ready
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("displays empty state on first load", async ({ page }) => {
    await expect(page.getByText(/Noch keine Aufgaben/i)).toBeVisible();
  });

  test("can add a new todo", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Test Aufgabe");
    await addButton.click();

    await expect(page.getByText("Test Aufgabe")).toBeVisible();
    await expect(page.getByText(/Noch keine Aufgaben/i)).not.toBeVisible();
  });

  test("cannot add empty todo", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await addButton.click();

    await expect(page.getByText(/Noch keine Aufgaben/i)).toBeVisible();
  });

  test("can add multiple todos", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Aufgabe 1");
    await addButton.click();

    await input.fill("Aufgabe 2");
    await addButton.click();

    await input.fill("Aufgabe 3");
    await addButton.click();

    await expect(page.getByText("Aufgabe 1")).toBeVisible();
    await expect(page.getByText("Aufgabe 2")).toBeVisible();
    await expect(page.getByText("Aufgabe 3")).toBeVisible();
  });

  test("can toggle todo as done", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("To complete");
    await addButton.click();
    await expect(page.getByText("To complete")).toBeVisible();

    // Click the checkbox
    const checkbox = page.getByRole("button", { name: /als erledigt markieren/i }).first();
    await checkbox.click();

    // Die Liste startet auf "Offen", die erledigte Aufgabe verschwindet also
    // daraus; erst "Alle" zeigt sie wieder.
    await expect(page.locator(".todo-list li")).toHaveCount(0);
    await page.locator(".status-filter").getByRole("button", { name: "Alle" }).click();

    // Todo should appear done (reduced opacity)
    const todoItem = page.locator(".todo-list li").first();
    await expect(todoItem).toHaveClass(/done/);
  });

  test("can delete a todo", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Delete me");
    await addButton.click();
    await expect(page.getByText("Delete me")).toBeVisible();

    // Hover over the todo to reveal action buttons
    const todoItem = page.locator(".todo-list li").first();
    await todoItem.hover();

    // Click delete button
    const deleteBtn = page.getByRole("button", { name: "Löschen" }).first();
    await deleteBtn.click();

    // Nicht page.getByText("Delete me"): die Rückgängig-Leiste zeigt nach dem
    // Löschen kurz "„Delete me" gelöscht." und würde denselben Text treffen.
    await expect(page.locator(".todo-list").getByText("Delete me")).not.toBeVisible();
  });

  test("can edit a todo by double-clicking", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Original title");
    await addButton.click();
    await expect(page.getByText("Original title")).toBeVisible();

    // Double-click opens the detail modal
    const title = page.getByText("Original title");
    await title.dblclick();

    // Edit input should appear
    const editInput = page.locator(".edit-input").first();
    await expect(editInput).toBeVisible();

    await editInput.fill("Updated title");
    await page.getByRole("button", { name: "Sichern" }).click();

    await expect(page.getByText("Updated title")).toBeVisible();
    await expect(page.getByText("Original title")).not.toBeVisible();
  });

  test("can change priority of a todo", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Priority test");
    await addButton.click();

    // Change priority to high
    const prioritySelect = page.locator(".priority-select-inline").first();
    await prioritySelect.selectOption("high");

    // Todo item should have high priority class
    const todoItem = page.locator(".todo-list li").first();
    await expect(todoItem).toHaveClass(/priority-high/);
  });

  test("can set priority when adding a todo", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const prioritySelect = page.locator(".add-form .priority-select");
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("High priority task");
    await prioritySelect.selectOption("high");
    await addButton.click();

    const todoItem = page.locator(".todo-list li").first();
    await expect(todoItem).toHaveClass(/priority-high/);
  });

  test("shows remaining count correctly", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    // Add 3 todos
    await input.fill("Task 1");
    await addButton.click();
    await input.fill("Task 2");
    await addButton.click();
    await input.fill("Task 3");
    await addButton.click();

    await expect(page.getByText(/3 von 3 Aufgabe.*offen/i)).toBeVisible();

    // Mark one as done
    const checkbox = page.getByRole("button", { name: /als erledigt markieren/i }).first();
    await checkbox.click();

    await expect(page.getByText(/2 von 3 Aufgabe.*offen/i)).toBeVisible();
  });

  test("shows completion message when all todos done", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Only task");
    await addButton.click();

    const checkbox = page.getByRole("button", { name: /als erledigt markieren/i }).first();
    await checkbox.click();

    await expect(page.getByText(/Alles erledigt/i)).toBeVisible();
  });
});

test.describe("Category Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("can open category manager", async ({ page }) => {
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    await expect(page.getByRole("heading", { name: /Kategorien/i })).toBeVisible();
  });

  test("can add a new category", async ({ page }) => {
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    const categoryInput = page.getByPlaceholder(/Neue Kategorie/i);
    await categoryInput.fill("Arbeit");

    const addBtn = page.getByRole("button", { name: "Hinzufügen", exact: true });
    await addBtn.click();

    await expect(page.locator(".category-name").getByText("Arbeit")).toBeVisible();
  });

  test("cannot add empty category", async ({ page }) => {
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    const addBtn = page.getByRole("button", { name: "Hinzufügen", exact: true });
    await addBtn.click();

    // Should not have added anything
    const categoryItems = page.locator(".category-item");
    await expect(categoryItems).toHaveCount(0);
  });

  test("can delete a category", async ({ page }) => {
    // First add a category
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    const categoryInput = page.getByPlaceholder(/Neue Kategorie/i);
    await categoryInput.fill("TestCat");

    const addBtn = page.getByRole("button", { name: "Hinzufügen", exact: true });
    await addBtn.click();

    await expect(page.locator(".category-name").getByText("TestCat")).toBeVisible();

    // Delete the category
    const deleteBtn = page.locator(".category-item .icon-button.danger").first();
    await deleteBtn.click();

    await expect(page.locator(".category-name").getByText("TestCat")).not.toBeVisible();
  });

  test("can assign category to a todo", async ({ page }) => {
    // Add a category first
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    const categoryInput = page.getByPlaceholder(/Neue Kategorie/i);
    await categoryInput.fill("Home");

    const addBtn = page.getByRole("button", { name: "Hinzufügen", exact: true });
    await addBtn.click();

    // Close category manager
    await page.locator(".close-btn").first().click();

    // Add a todo
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Home task");
    const todoAddBtn = page.getByRole("button", { name: /Aufgabe hinzufügen/i });
    await todoAddBtn.click();

    // Assign category via todo select
    const todoCategorySelect = page.locator(".todo-select").first();
    await todoCategorySelect.selectOption("Home");

    // Category badge should appear
    await expect(page.locator(".category-badge").getByText("Home")).toBeVisible();
  });

  test("can filter todos by category", async ({ page }) => {
    // Add category
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    const categoryInput = page.getByPlaceholder(/Neue Kategorie/i);
    await categoryInput.fill("Work");

    const addBtn = page.getByRole("button", { name: "Hinzufügen", exact: true });
    await addBtn.click();

    // Close category manager
    await page.locator(".close-btn").first().click();

    // Add todo with category
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Work task");
    const todoAddBtn = page.getByRole("button", { name: /Aufgabe hinzufügen/i });
    await todoAddBtn.click();

    const todoCategorySelect = page.locator(".todo-select").first();
    await todoCategorySelect.selectOption("Work");

    // Add another todo without category
    await input.fill("Personal task");
    await todoAddBtn.click();

    // Filter by category
    const filterCategorySelect = page.locator(".filter-select");
    await filterCategorySelect.selectOption("Work");

    await expect(page.getByText("Work task")).toBeVisible();
    await expect(page.getByText("Personal task")).not.toBeVisible();
  });
});

test.describe("Filtering and Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("can search for todos", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Apple pie");
    await addButton.click();
    await input.fill("Banana smoothie");
    await addButton.click();
    await input.fill("Cherry tart");
    await addButton.click();

    // Search for "banana"
    const searchInput = page.getByPlaceholder(/Suche/i);
    await searchInput.fill("banana");

    await expect(page.getByText("Banana smoothie")).toBeVisible();
    await expect(page.getByText("Apple pie")).not.toBeVisible();
    await expect(page.getByText("Cherry tart")).not.toBeVisible();
  });

  test("can filter by status: open", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Open task");
    await addButton.click();
    await input.fill("Done task");
    await addButton.click();

    // Mark "Done task" (first in list, newest added) as done
    const checkboxes = page.getByRole("button", { name: /als erledigt markieren/i });
    await checkboxes.nth(0).click();

    // Filter by open (scope to status-filter container)
    const openBtn = page.locator(".status-filter").getByRole("button", { name: "Offen" });
    await openBtn.click();

    await expect(page.locator(".todo-list .title").getByText("Open task")).toBeVisible();
    await expect(page.locator(".todo-list .title").getByText("Done task")).not.toBeVisible();
  });

  test("can filter by status: done", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Open task");
    await addButton.click();
    await input.fill("Done task");
    await addButton.click();

    // Mark "Done task" (first in list, newest added) as done
    const checkboxes = page.getByRole("button", { name: /als erledigt markieren/i });
    await checkboxes.nth(0).click();

    // Filter by done (scope to status-filter container)
    const doneBtn = page.locator(".status-filter").getByRole("button", { name: "Erledigt" });
    await doneBtn.click();

    await expect(page.locator(".todo-list .title").getByText("Done task")).toBeVisible();
    await expect(page.locator(".todo-list .title").getByText("Open task")).not.toBeVisible();
  });

  test("startet auf Offen und merkt sich die Wahl", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Offene Aufgabe");
    await addButton.click();
    await input.fill("Erledigte Aufgabe");
    await addButton.click();
    await page.getByRole("button", { name: /als erledigt markieren/i }).first().click();

    // Ohne gespeicherte Wahl steht die Liste auf "Offen".
    await expect(page.getByRole("button", { name: "Status Offen" })).toHaveClass(/active/);
    await expect(page.locator(".todo-list .title").getByText("Offene Aufgabe")).toBeVisible();
    await expect(page.locator(".todo-list .title").getByText("Erledigte Aufgabe")).toHaveCount(0);

    await page.getByRole("button", { name: "Status Alle" }).click();
    await expect(page.locator(".todo-list .title").getByText("Erledigte Aufgabe")).toBeVisible();

    // Die Wahl ueberlebt den Neustart.
    await page.reload();
    await expect(page.getByRole("button", { name: "Status Alle" })).toHaveClass(/active/);
    await expect(page.locator(".todo-list .title").getByText("Erledigte Aufgabe")).toBeVisible();
  });

  test("setzt Zurücksetzen auf Offen, nicht auf Alle", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Eine Aufgabe");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();

    await page.getByRole("button", { name: "Status Alle" }).click();
    await expect(page.locator(".active-filters")).toBeVisible();

    await page.getByRole("button", { name: /Zurücksetzen/i }).click();

    await expect(page.getByRole("button", { name: "Status Offen" })).toHaveClass(/active/);
    await expect(page.locator(".active-filters")).toHaveCount(0);
  });

  test("can clear all filters", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Task 1");
    await addButton.click();
    await input.fill("Task 2");
    await addButton.click();

    // Apply search filter
    const searchInput = page.getByPlaceholder(/Suche/i);
    await searchInput.fill("Task 1");

    // Clear filters
    const clearBtn = page.getByRole("button", { name: /Zurücksetzen/i });
    await clearBtn.click();

    await expect(page.getByText("Task 1")).toBeVisible();
    await expect(page.getByText("Task 2")).toBeVisible();
  });
});

test.describe("Layout and UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("app header is visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
    await expect(page.locator(".app-subtitle")).toBeVisible();
    await expect(page.locator(".app-subtitle")).toHaveText(/Keine Aufgaben|offen/i);
  });

  test("add form is visible and functional", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();

    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
  });

  test("filter bar buttons are visible", async ({ page }) => {
    // Due date filter "Alle"
    await expect(page.locator(".filter-btn").getByText("Alle")).toBeVisible();
    // Status filter buttons
    await expect(page.locator(".status-filter").getByRole("button", { name: "Offen" })).toBeVisible();
    await expect(page.locator(".status-filter").getByRole("button", { name: "Erledigt" })).toBeVisible();
  });

  test("changelog modal opens and closes", async ({ page }) => {
    const changelogBtn = page.getByRole("button", { name: "Changelog" });
    await changelogBtn.click();

    await expect(page.getByRole("heading", { name: "Changelog" })).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");

    await expect(page.locator(".changelog-modal")).not.toBeVisible();
  });

  test("todo actions appear on hover", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Hover test");
    await addButton.click();

    const todoItem = page.locator(".todo-list li").first();
    await todoItem.hover();

    const editBtn = page.getByRole("button", { name: "Aufgabe bearbeiten" }).first();
    await expect(editBtn).toBeVisible();

    const deleteBtn = page.getByRole("button", { name: "Löschen" }).first();
    await expect(deleteBtn).toBeVisible();
  });

  test("edit mode can be cancelled with Escape", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Cancel test");
    await addButton.click();

    const title = page.getByText("Cancel test");
    await title.dblclick();

    await expect(page.locator(".edit-input").first()).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(".edit-input").first()).not.toBeVisible();
    await expect(page.getByText("Cancel test")).toBeVisible();
  });

  test("category manager closes with Escape", async ({ page }) => {
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    await expect(page.locator(".category-modal")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(".category-modal")).not.toBeVisible();
  });

  test("category manager closes when clicking overlay", async ({ page }) => {
    const categoryBtn = page.getByRole("button", { name: /Kategorien verwalten/i });
    await categoryBtn.click();

    await expect(page.locator(".category-modal")).toBeVisible();

    // Click outside the modal (on the overlay area)
    await page.locator(".modal-overlay").first().click({ position: { x: 0, y: 0 } });

    await expect(page.locator(".category-modal")).not.toBeVisible();
  });

  test("version info is displayed", async ({ page }) => {
    await expect(page.locator(".version")).toBeVisible();
  });

  test("todo list items have proper structure", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Structure test");
    await addButton.click();

    const todoItem = page.locator(".todo-list li").first();

    // Should have checkbox
    await expect(todoItem.locator(".checkbox")).toBeVisible();

    // Should have title
    await expect(todoItem.locator(".title")).toBeVisible();

    // Should have priority select
    await expect(todoItem.locator(".priority-select-inline")).toBeVisible();

    // Should have category select
    await expect(todoItem.locator(".todo-select")).toBeVisible();

    // Should have actions container
    await expect(todoItem.locator(".todo-actions")).toBeVisible();
  });

  test("app is responsive on mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const input = page.getByPlaceholder(/Was steht an/i);
    await expect(input).toBeVisible();

    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });
    await expect(addButton).toBeVisible();

    await input.fill("Mobile test");
    await addButton.click();

    await expect(page.getByText("Mobile test")).toBeVisible();
  });

  test("long todo titles wrap correctly", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    const longTitle = "This is a very long todo title that should wrap to multiple lines when it exceeds the available width of the container element";
    await input.fill(longTitle);
    await addButton.click();

    await expect(page.getByText(longTitle)).toBeVisible();

    const item = page.locator(".todo-list li").first();
    const title = page.locator(".todo-list .title").first();
    const boundingBox = await title.boundingBox();
    const itemBox = await item.boundingBox();
    expect(boundingBox).toBeDefined();
    expect(itemBox).toBeDefined();
    // Title should not overflow its row
    expect(boundingBox!.width).toBeLessThanOrEqual(itemBox!.width);
  });

  test("footer shows correct count with filters", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Task A");
    await addButton.click();
    await input.fill("Task B");
    await addButton.click();
    await input.fill("Task C");
    await addButton.click();

    // Apply search filter
    const searchInput = page.getByPlaceholder(/Suche/i);
    await searchInput.fill("Task A");

    // Footer should show filtered count
    await expect(page.locator(".footer")).toContainText("1 von 3");
  });

  test("active filters display and reset", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Test");
    await addButton.click();

    // Apply search filter
    const searchInput = page.getByPlaceholder(/Suche/i);
    await searchInput.fill("Test");

    // Active filters should be displayed
    await expect(page.locator(".active-filters")).toBeVisible();

    // Reset filters
    const clearBtn = page.getByRole("button", { name: /Zurücksetzen/i });
    await clearBtn.click();

    await expect(page.locator(".active-filters")).not.toBeVisible();
  });
});

test.describe("Beschreibung", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("kann eine Beschreibung setzen und im Brett sehen", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Mit Beschreibung");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await expect(page.getByText("Mit Beschreibung")).toBeVisible();

    await page.getByRole("button", { name: "Aufgabe bearbeiten" }).first().click();
    // Exakt, nicht als Muster: die Notiz-Markierung in der Zeile heisst
    // "Hat eine Beschreibung" und wuerde ein /Beschreibung/i sonst mittreffen.
    await page.getByLabel("Beschreibung", { exact: true }).fill("Belege aus dem Ordner");
    await page.getByRole("button", { name: /Sichern/i }).click();

    await expect(page.getByLabel("Beschreibung", { exact: true })).not.toBeVisible();

    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    await expect(page.getByText("Belege aus dem Ordner")).toBeVisible();
  });

  test("zeigt die Beschreibung beim zweiten Oeffnen als gesetztes Markdown", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Markdown-Aufgabe");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await expect(page.getByText("Markdown-Aufgabe")).toBeVisible();

    await page.getByRole("button", { name: "Aufgabe bearbeiten" }).first().click();
    await page
      .getByLabel("Beschreibung", { exact: true })
      .fill("## Kontext\n\n- **Betrag** prüfen\n- [x] Freigabe geholt");
    await page.getByRole("button", { name: /Sichern/i }).click();
    await expect(page.getByLabel("Beschreibung", { exact: true })).not.toBeVisible();

    // Zweites Oeffnen: das Fenster steht im Lesemodus, das Textfeld erscheint
    // erst nach dem Umschalten.
    await page.getByRole("button", { name: "Aufgabe bearbeiten" }).first().click();
    await expect(page.locator(".markdown h4")).toHaveText("Kontext");
    await expect(page.locator(".markdown strong")).toHaveText("Betrag");
    await expect(page.locator(".markdown-check.checked")).toBeVisible();
    // Ueber die Rolle: die Leseflaeche traegt denselben Namen wie das Textfeld.
    await expect(page.getByRole("textbox", { name: "Beschreibung" })).toHaveCount(0);

    await page.getByRole("button", { name: "Beschreibung bearbeiten" }).click();
    await expect(page.getByRole("textbox", { name: "Beschreibung" })).toBeVisible();
  });
});

test.describe("Brett-Filter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();

    // Eine Kategorie, eine Aufgabe darin und eine ohne Kategorie.
    await page.getByRole("button", { name: /Kategorien verwalten/i }).click();
    await page.getByPlaceholder(/Neue Kategorie/i).fill("Arbeit");
    await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
    await expect(page.locator(".category-name").getByText("Arbeit")).toBeVisible();
    await page.getByRole("button", { name: /Schließen/i }).click();

    const input = page.getByPlaceholder(/Was steht an/i);
    await input.fill("Arbeit-Aufgabe");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await page.locator(".todo-select").first().selectOption("Arbeit");
    await expect(page.locator(".category-badge").getByText("Arbeit")).toBeVisible();

    await input.fill("Aufgabe ohne Kategorie");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();

    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    await expect(page.locator(".kanban-wrapper")).toBeVisible();
  });

  test("filtert das Brett auf eine Kategorie und wieder zurück", async ({ page }) => {
    await expect(page.locator(".board-filter").getByRole("button", { name: "Alle Kategorien" })).toHaveClass(/active/);
    await expect(page.locator(".kanban-wrapper").getByText("Arbeit-Aufgabe")).toBeVisible();
    await expect(page.locator(".kanban-wrapper").getByText("Aufgabe ohne Kategorie")).toBeVisible();

    await page.locator(".board-filter").getByRole("button", { name: "Kategorie Arbeit" }).click();

    await expect(page.locator(".kanban-wrapper").getByText("Arbeit-Aufgabe")).toBeVisible();
    await expect(page.locator(".kanban-wrapper").getByText("Aufgabe ohne Kategorie")).toHaveCount(0);

    await page.locator(".board-filter").getByRole("button", { name: "Alle Kategorien" }).click();

    await expect(page.locator(".kanban-wrapper").getByText("Aufgabe ohne Kategorie")).toBeVisible();
  });

  test("zeigt mit Ohne Kategorie nur die Aufgaben ohne Kategorie", async ({ page }) => {
    await page.locator(".board-filter").getByRole("button", { name: "Ohne Kategorie" }).click();

    await expect(page.locator(".kanban-wrapper").getByText("Aufgabe ohne Kategorie")).toBeVisible();
    await expect(page.locator(".kanban-wrapper").getByText("Arbeit-Aufgabe")).toHaveCount(0);
  });

  test("hält den Brett-Filter vom Listen-Filter getrennt", async ({ page }) => {
    await page.locator(".board-filter").getByRole("button", { name: "Kategorie Arbeit" }).click();
    await expect(page.locator(".kanban-wrapper").getByText("Aufgabe ohne Kategorie")).toHaveCount(0);

    await page.getByRole("button", { name: /Zur Ansicht Liste wechseln/i }).click();

    await expect(page.locator(".todo-list .title").getByText("Aufgabe ohne Kategorie")).toBeVisible();
  });
});

test.describe("Brett-Sortierung", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  test("haelt die gezogene Reihenfolge einer Spalte ueber einen Reload", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Zuerst");
    await addButton.click();
    await input.fill("Danach");
    await addButton.click();

    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    const titles = page.locator(".kanban-card-title");
    // Ohne Faelligkeit und ohne bisherigen Drag entscheidet der Tie-Breaker
    // in sortBoardTodos ueber created_at absteigend -- die zuletzt angelegte
    // Aufgabe ("Danach") steht also zuerst.
    await expect(titles).toHaveText(["Danach", "Zuerst"]);

    // HTML5-Drag von Hand: dragstart auf der zweiten Karte, dragover und drop
    // auf der oberen Haelfte der ersten.
    await page.evaluate(() => {
      const cards = document.querySelectorAll<HTMLElement>(".kanban-card");
      const source = cards[1];
      const target = cards[0];
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      const rect = target.getBoundingClientRect();
      const clientY = rect.top + 2;
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer, clientY }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer, clientY }));
    });

    await expect(titles).toHaveText(["Zuerst", "Danach"]);

    await page.reload();
    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    await expect(titles).toHaveText(["Zuerst", "Danach"]);
  });
});

test.describe("Papierkorb", () => {
  test("holt eine gelöschte Aufgabe über Rückgängig zurück", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Was steht an/i).fill("Versehentlich");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await expect(page.getByText("Versehentlich")).toBeVisible();

    await page.getByLabel("Löschen").first().click();
    await expect(page.getByText(/Versehentlich.*gelöscht/)).toBeVisible();

    await page.getByRole("button", { name: "Rückgängig" }).click();

    await expect(page.getByText("Versehentlich")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  });

  test("holt eine gelöschte Aufgabe aus dem Papierkorb zurück", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/Was steht an/i).fill("Im Papierkorb");
    await page.getByRole("button", { name: /Aufgabe hinzufügen/i }).click();
    await page.getByLabel("Löschen").first().click();

    await page.getByLabel("Papierkorb").click();
    await expect(page.getByRole("heading", { name: "Papierkorb" })).toBeVisible();
    await page.getByLabel("Wiederherstellen").click();
    await expect(page.getByText("Der Papierkorb ist leer.")).toBeVisible();
    await page.getByLabel("Schließen").click();

    await expect(page.getByText("Im Papierkorb")).toBeVisible();
  });
});
