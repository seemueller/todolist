import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let insideTauri = true;
vi.mock("./sqlClient", () => ({
  isTauri: () => insideTauri,
  getDb: () => Promise.reject(new Error("in Tests nicht verfuegbar")),
}));

import { McpSettings } from "./McpSettings";

/** Kein echter Token, aber gleiche Gestalt: base64url, 43 Zeichen. */
const TOKEN = "wAOe1Gk9lQx4pT7vZs0Hn2Ry6Ub3Cd8Ef5Gh1Ij4Kl7";

const writeText = vi.fn();

function mockStatus(status: { running: boolean; port: number; token: string }) {
  invokeMock.mockImplementation((command: string) => {
    if (command === "mcp_status") return Promise.resolve(status);
    return Promise.reject(new Error(`unerwarteter Befehl ${command}`));
  });
}

/** Rendert und wartet, bis der Status geladen ist. */
async function renderLoaded() {
  render(<McpSettings />);
  await screen.findByText(/Port/);
}

describe("McpSettings", () => {
  beforeEach(() => {
    insideTauri = true;
    invokeMock.mockReset();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    mockStatus({ running: true, port: 4319, token: TOKEN });
  });

  it("zeigt Status und Port, wenn der Server laeuft", async () => {
    await renderLoaded();
    expect(screen.getByText(/Läuft auf Port 4319/)).toBeInTheDocument();
  });

  it("verdeckt den Token beim Oeffnen", async () => {
    await renderLoaded();
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(screen.getByLabelText("Token anzeigen")).toBeInTheDocument();
  });

  it("zeigt den Token erst auf Knopfdruck und verdeckt ihn wieder", async () => {
    await renderLoaded();

    fireEvent.click(screen.getByLabelText("Token anzeigen"));
    expect(document.body.textContent).toContain(TOKEN);

    fireEvent.click(screen.getByLabelText("Token verbergen"));
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("legt den Token beim Kopieren nur in die Zwischenablage", async () => {
    await renderLoaded();

    fireEvent.click(screen.getByLabelText("Token kopieren"));

    expect(writeText).toHaveBeenCalledWith(TOKEN);
    // Der Wert bleibt verdeckt; nur die Rueckmeldung erscheint.
    await screen.findByText("Kopiert");
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("kopiert eine Client-Zeile mit Port und Token", async () => {
    await renderLoaded();

    fireEvent.click(screen.getByLabelText("Client-Befehl kopieren"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("http://127.0.0.1:4319/mcp");
    expect(copied).toContain(`Authorization: Bearer ${TOKEN}`);
    expect(copied).toBe(
      `claude mcp add --transport http todolist http://127.0.0.1:4319/mcp ` +
        `--header "Authorization: Bearer ${TOKEN}"`
    );
  });

  it("zeigt den Token auch in der Client-Zeile nicht im Klartext", async () => {
    await renderLoaded();

    expect(screen.getByText(/claude mcp add --transport http todolist/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);

    fireEvent.click(screen.getByLabelText("Token anzeigen"));
    expect(
      screen.getByText(new RegExp(`Authorization: Bearer ${TOKEN}`))
    ).toBeInTheDocument();
  });

  it("sagt es, wenn der Server nicht laeuft, und bietet keine Client-Zeile an", async () => {
    mockStatus({ running: false, port: 4319, token: "" });
    render(<McpSettings />);

    await screen.findByText(/läuft nicht/i);
    expect(screen.queryByText(/claude mcp add/)).toBeNull();
    expect(screen.queryByLabelText("Token kopieren")).toBeNull();
    expect(screen.queryByLabelText("Token anzeigen")).toBeNull();
  });

  it("sagt es, wenn der Status nicht zu lesen ist, ohne einen Token zu zeigen", async () => {
    invokeMock.mockRejectedValue(new Error("kaputt"));
    render(<McpSettings />);

    await screen.findByText(/nicht lesen/i);
    expect(screen.queryByLabelText("Token anzeigen")).toBeNull();
  });

  it("fragt das Backend gar nicht erst, wenn die App im Browser laeuft", async () => {
    insideTauri = false;
    render(<McpSettings />);

    await screen.findByText(/nur in der App/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
