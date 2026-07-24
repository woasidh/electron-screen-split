import { expect, test } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

test("disables Tauri native drag-drop so Windows can use HTML5 card dragging", () => {
  const manager = tauriConfig.app.windows.find((window) => window.label === "manager");

  expect(manager?.dragDropEnabled).toBe(false);
});
