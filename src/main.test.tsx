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

  it("does not relabel a render failure as a migration failure", async () => {
    // Migration succeeds, but the first render itself throws (e.g. a bug in
    // App). start() must be called exactly once, with null -- a render
    // failure must never be reported to the user as a failed migration, and
    // must never trigger a second render attempt.
    migrate.mockResolvedValue(undefined);
    render.mockImplementationOnce(() => {
      throw new Error("render boom");
    });

    // The render failure is expected to surface as an unhandled rejection on
    // the module-level promise chain (nothing downstream catches it anymore,
    // by design -- see the fix). Swallow just that so the test runner doesn't
    // flag it as a stray failure.
    const onUnhandledRejection = (reason: unknown) => {
      expect(String(reason)).toContain("render boom");
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      await import("./main");
      await vi.waitFor(() => expect(render).toHaveBeenCalled());
      // Give the rejected chain a tick to (not) trigger a second start() call.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(render).toHaveBeenCalledTimes(1);
      const appElement = render.mock.calls[0][0].props.children;
      expect(appElement.props.migrationError).toBeNull();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
