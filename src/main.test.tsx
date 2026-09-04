import { describe, it, expect, vi, beforeEach } from "vitest";

const migrate = vi.fn();
const render = vi.fn();

vi.mock("./migrateLocalStorage", () => ({
  migrateLocalStorage: () => migrate(),
  MIGRATED_FLAG: "todolist_migrated_to_sqlite",
}));

vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render }) },
}));

vi.mock("./App", () => ({ default: () => null }));

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    migrate.mockReset();
    render.mockReset();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("migrates before rendering", async () => {
    const order: string[] = [];
    migrate.mockImplementation(() => {
      order.push("migrate");
      return Promise.resolve();
    });
    render.mockImplementation(() => {
      order.push("render");
    });

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    expect(order).toEqual(["migrate", "render"]);

    const appElement = render.mock.calls[0][0].props.children;
    expect(appElement.props.migrationError).toBeNull();
  });

  it("still renders when the migration fails, and passes the failure to App", async () => {
    migrate.mockRejectedValue(new Error("disk full"));

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    const appElement = render.mock.calls[0][0].props.children;
    expect(typeof appElement.props.migrationError).toBe("string");
    expect(appElement.props.migrationError).toMatch(/erneut versucht/);
  });
});
