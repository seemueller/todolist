import { test, expect, type Page } from "@playwright/test";

/**
 * Die View zeigt immer die laufende Arbeitswoche. Die Zellen werden darum ueber
 * ihre Position im Raster angesprochen: 20 Spalten je Stundenzeile, vier je Tag.
 */
const COLUMNS_PER_DAY = 4;
const DAYS = 5;
const START_HOUR = 6;

function cell(page: Page, dayIndex: number, hour: number, quarter: number, days = DAYS) {
  const index =
    (hour - START_HOUR) * COLUMNS_PER_DAY * days + dayIndex * COLUMNS_PER_DAY + quarter;
  return page.locator(".time-cell").nth(index);
}

test.describe("Zeiterfassung", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TodoList" })).toBeVisible();
  });

  /** Legt eine Kategorie an; ohne Kategorie kann nicht gebucht werden. */
  async function addCategory(page: Page, name: string) {
    await page.getByRole("button", { name: /Kategorien verwalten/i }).click();
    await page.getByPlaceholder(/Neue Kategorie/i).fill(name);
    await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
    await expect(page.locator(".category-name").getByText(name)).toBeVisible();
    await page.getByRole("button", { name: /Schließen/i }).click();
  }

  /** Oeffnet das Einstellungs-Popup der Zeiterfassung. */
  async function openSettings(page: Page) {
    await page.getByRole("button", { name: /Einstellungen der Zeiterfassung/i }).click();
    await expect(page.locator(".time-settings")).toBeVisible();
  }

  async function openTimeView(page: Page) {
    await page.getByRole("button", { name: /Zur Ansicht Zeit wechseln/i }).click();
    await expect(page.locator(".time-daybar")).toBeVisible();
  }

  test("zeigt ohne Kategorie den Leerzustand", async ({ page }) => {
    await openTimeView(page);

    await expect(page.locator(".time-empty")).toBeVisible();
    await expect(page.locator(".time-grid")).toHaveCount(0);
  });

  test("blendet das Hinzufügen-Formular in der Zeit-Ansicht aus", async ({ page }) => {
    await expect(page.locator(".add-form")).toBeVisible();
    await openTimeView(page);

    await expect(page.locator(".add-form")).toHaveCount(0);
  });

  test("zeigt fünf Tagesspalten mit je vier Viertelstunden", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await expect(page.locator(".time-day-label")).toHaveCount(DAYS);
    await expect(page.locator(".time-cell")).toHaveCount(17 * COLUMNS_PER_DAY * DAYS);
    await expect(page.locator(".time-day-sum")).toHaveCount(DAYS);
  });

  test("bucht eine Viertelstunde und zeigt sie als Block", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).click();

    await expect(page.getByText("09:00–09:15")).toBeVisible();
    await expect(page.locator(".time-block-duration")).toHaveText("0:15");
    await expect(page.locator(".time-total strong")).toHaveText("0:15");
    await expect(page.locator(".time-day-sum").nth(0)).toHaveText("0:15");
  });

  test("malt beim Ziehen den ganzen Bereich einer Spalte", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 2, 9, 0).hover();
    await page.mouse.down();
    await cell(page, 2, 10, 3).hover();
    await page.mouse.up();

    await expect(page.getByText("09:00–11:00")).toBeVisible();
    await expect(page.locator(".time-block-duration")).toHaveText("2:00");
    await expect(page.locator(".time-day-sum").nth(2)).toHaveText("2:00");
  });

  test("malt nicht über die Tagesgrenze hinweg", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).hover();
    await page.mouse.down();
    await cell(page, 1, 9, 0).hover();
    await page.mouse.up();

    await expect(page.locator(".time-day-sum").nth(0)).toHaveText("0:15");
    await expect(page.locator(".time-day-sum").nth(1)).toHaveText("0:00");
  });

  test("leert eine Buchung beim zweiten Klick", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).click();
    await expect(page.locator(".time-block")).toHaveCount(1);

    await cell(page, 0, 9, 0).click();

    await expect(page.locator(".time-block")).toHaveCount(0);
  });

  test("gruppiert die Blockliste nach Tag", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).click();
    await cell(page, 3, 14, 0).click();

    await expect(page.locator(".time-block-group")).toHaveCount(2);
    await expect(page.locator(".time-block")).toHaveCount(2);
  });

  test("speichert eine Notiz am Block über einen Neuladevorgang hinweg", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).click();
    const note = page.locator(".time-note-input");
    await note.fill("Refactoring");
    await note.press("Enter");

    await page.reload();
    await openTimeView(page);

    await expect(page.locator(".time-note-input")).toHaveValue("Refactoring");
  });

  test("blättert Wochen und hält die Buchungen je Woche getrennt", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).click();
    await expect(page.locator(".time-total strong")).toHaveText("0:15");
    const label = await page.locator(".time-date").textContent();

    await page.getByRole("button", { name: /Nächste Woche/i }).click();
    await expect(page.locator(".time-total strong")).toHaveText("0:00");
    await expect(page.locator(".time-date")).not.toHaveText(label ?? "");

    await page.getByRole("button", { name: /Vorherige Woche/i }).click();
    await expect(page.locator(".time-total strong")).toHaveText("0:15");
    await expect(page.locator(".time-date")).toHaveText(label ?? "");
  });

  test("löscht einen ganzen Block", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await cell(page, 0, 9, 0).hover();
    await page.mouse.down();
    await cell(page, 0, 9, 1).hover();
    await page.mouse.up();
    await expect(page.locator(".time-block-duration")).toHaveText("0:30");

    await page.locator(".time-block .action-btn").click();

    await expect(page.locator(".time-block")).toHaveCount(0);
    await expect(page.locator(".time-total strong")).toHaveText("0:00");
  });

  test("zeigt die Differenz in der Kopfzeile, das Soll erst im Popup", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await expect(page.locator(".time-difference")).toHaveText("-40:00");
    await expect(page.locator(".time-difference")).toHaveClass(/behind/);
    // Die Kopfzeile bleibt frei von Einstellungen.
    await expect(page.locator(".time-target-value")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Woche als CSV exportieren/i })).toHaveCount(0);

    await cell(page, 0, 9, 0).click();
    await expect(page.locator(".time-difference")).toHaveText("-39:45");

    await openSettings(page);
    await expect(page.locator(".time-target-value")).toHaveText("8:00");
    await expect(page.locator(".time-setting-hint strong")).toHaveText("40:00");
  });

  test("schließt das Einstellungs-Popup über Escape und Overlay", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await openSettings(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".time-settings")).toHaveCount(0);

    await openSettings(page);
    await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".time-settings")).toHaveCount(0);
  });

  test("verstellt die Sollzeit in Viertelstunden-Schritten und merkt sie sich", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);

    await openSettings(page);
    await page
      .getByRole("button", { name: /Sollzeit je Tag um 15 Minuten verringern/i })
      .click();
    await expect(page.locator(".time-target-value")).toHaveText("7:45");

    await page.reload();
    await openTimeView(page);
    await openSettings(page);
    await expect(page.locator(".time-target-value")).toHaveText("7:45");
  });

  test("schaltet das Wochenende zu und merkt es sich", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);
    await expect(page.locator(".time-day-label")).toHaveCount(5);

    await openSettings(page);
    await page.getByRole("button", { name: /Wochenende anzeigen/i }).click();

    await expect(page.locator(".time-day-label")).toHaveCount(7);
    await expect(page.locator(".time-cell.weekend")).toHaveCount(17 * COLUMNS_PER_DAY * 2);
    // Das Soll haengt an den Arbeitstagen, nicht an den Spalten.
    await expect(page.locator(".time-setting-hint strong")).toHaveText("40:00");

    await page.reload();
    await openTimeView(page);
    await expect(page.locator(".time-day-label")).toHaveCount(7);
  });

  test("legt bei sichtbarem Wochenende alle sieben Tage in eine Rasterzeile", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);
    await openSettings(page);
    await page.getByRole("button", { name: /Wochenende anzeigen/i }).click();
    await page.getByRole("button", { name: /Schließen/i }).click();
    await expect(page.locator(".time-day-label")).toHaveCount(7);

    // Erste und letzte Zelle der Stundenzeile liegen auf derselben Hoehe, die
    // erste Zelle der naechsten Stunde darunter. Faengt einen Umbruch im Grid.
    const cells = page.locator(".time-grid-row").first().locator(".time-cell");
    await expect(cells).toHaveCount(7 * COLUMNS_PER_DAY);
    const first = await cells.first().boundingBox();
    const last = await cells.nth(7 * COLUMNS_PER_DAY - 1).boundingBox();
    expect(last?.y).toBeCloseTo(first?.y ?? 0, 0);

    // Auch die Tagessummen stehen in einer Zeile.
    const sums = page.locator(".time-day-sum");
    const firstSum = await sums.first().boundingBox();
    const lastSum = await sums.nth(6).boundingBox();
    expect(lastSum?.y).toBeCloseTo(firstSum?.y ?? 0, 0);
  });

  test("bucht am Wochenende, wenn es sichtbar ist", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);
    await openSettings(page);
    await page.getByRole("button", { name: /Wochenende anzeigen/i }).click();
    await page.getByRole("button", { name: /Schließen/i }).click();
    await expect(page.locator(".time-day-label")).toHaveCount(7);

    await cell(page, 5, 10, 0, 7).click();

    await expect(page.locator(".time-total strong")).toHaveText("0:15");
    await expect(page.locator(".time-day-sum").nth(5)).toHaveText("0:15");
  });

  test("exportiert die Woche als CSV", async ({ page }) => {
    await addCategory(page, "Alpha");
    await openTimeView(page);
    await cell(page, 0, 9, 0).click();
    await expect(page.locator(".time-block")).toHaveCount(1);
    const note = page.locator(".time-note-input");
    await note.fill("Ticket 4711; Teil A");
    await note.press("Enter");

    await openSettings(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Woche als CSV exportieren/i }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^zeiterfassung-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv).toContain("Datum;Von;Bis;Dauer;Minuten;Kategorie;Notiz");
    expect(csv).toContain('09:00;09:15;0:15;15;Alpha;"Ticket 4711; Teil A"');
  });

  test("wechselt zwischen allen drei Ansichten", async ({ page }) => {
    await openTimeView(page);
    await page.getByRole("button", { name: /Zur Ansicht Brett wechseln/i }).click();
    await expect(page.locator(".kanban-wrapper")).toBeVisible();

    await page.getByRole("button", { name: /Zur Ansicht Liste wechseln/i }).click();
    await expect(page.locator(".filter-bar")).toBeVisible();
  });
});
