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

const purgeDeletedBefore = vi.fn((_cutoff: string) => Promise.resolve(0) as Promise<number>);

vi.mock("./db", () => ({
  purgeDeletedBefore: (cutoff: string) => purgeDeletedBefore(cutoff),
}));

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    migrate.mockReset();
    render.mockReset();
    purgeDeletedBefore.mockReset();
    purgeDeletedBefore.mockResolvedValue(0);
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("disk full");
    migrate.mockRejectedValue(failure);

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    const appElement = render.mock.calls[0][0].props.children;
    expect(typeof appElement.props.migrationError).toBe("string");
    expect(appElement.props.migrationError).toMatch(/erneut versucht/);

    expect(consoleError).toHaveBeenCalledWith("localStorage migration failed", failure);
    consoleError.mockRestore();
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

  it("purges the trash on startup, before the first render", async () => {
    const order: string[] = [];
    migrate.mockResolvedValue(undefined);
    purgeDeletedBefore.mockImplementation((_cutoff: string) => {
      order.push("purge");
      return Promise.resolve(0);
    });
    render.mockImplementation(() => {
      order.push("render");
    });

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    expect(order).toEqual(["purge", "render"]);
    expect(purgeDeletedBefore).toHaveBeenCalledTimes(1);
    expect(typeof purgeDeletedBefore.mock.calls[0][0]).toBe("string");
  });

  it("still renders when the purge fails, without turning it into a migration error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    migrate.mockResolvedValue(undefined);
    purgeDeletedBefore.mockRejectedValue(new Error("db locked"));

    await import("./main");
    await vi.waitFor(() => expect(render).toHaveBeenCalled());

    expect(consoleError).toHaveBeenCalledWith("purging the trash failed", expect.any(Error));

    const appElement = render.mock.calls[0][0].props.children;
    expect(appElement.props.migrationError).toBeNull();
    consoleError.mockRestore();
  });
});
