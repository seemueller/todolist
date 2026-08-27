import { describe, it, expect } from "vitest";
import config from "../src-tauri/tauri.conf.json";

describe("tauri window config", () => {
  // Tauri haengt standardmaessig einen nativen Drag-and-drop-Handler in das
  // Webview. Unter Windows verschluckt der die HTML5-Events, das Kanban-Brett
  // bekommt dragstart/dragover/drop dann nie zu sehen. Siehe tauri-utils,
  // WindowConfig::drag_drop_enabled: "Disabling it is required to use HTML5
  // drag and drop on the frontend on Windows."
  it("disables the native drag and drop handler so HTML5 drag and drop works", () => {
    for (const window of config.app.windows) {
      expect(window.dragDropEnabled).toBe(false);
    }
  });
});
