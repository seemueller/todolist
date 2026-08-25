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

    await expect(page.getByText("Delete me")).not.toBeVisible();
  });

  test("can edit a todo by double-clicking", async ({ page }) => {
    const input = page.getByPlaceholder(/Was steht an/i);
    const addButton = page.getByRole("button", { name: /Aufgabe hinzufügen/i });

    await input.fill("Original title");
    await addButton.click();
    await expect(page.getByText("Original title")).toBeVisible();

    // Double-click to edit
    const title = page.getByText("Original title");
    await title.dblclick();

    // Edit input should appear
    const editInput = page.locator(".edit-input").first();
    await expect(editInput).toBeVisible();

    await editInput.fill("Updated title");
    await editInput.press("Enter");

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
    await expect(page.getByText(/Behalte den Überblick/i)).toBeVisible();
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

    const editBtn = page.getByRole("button", { name: "Bearbeiten" }).first();
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

    const title = page.locator(".todo-list .title").first();
    const boundingBox = await title.boundingBox();
    expect(boundingBox).toBeDefined();
    // Title should not overflow the container
    expect(boundingBox!.width).toBeLessThan(480);
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
