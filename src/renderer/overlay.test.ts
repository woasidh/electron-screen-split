import { expect, test, vi } from "vitest";
import markup from "./overlay.html?raw";
import { bindOverlay } from "./overlay";

test("overlay button requests manager restoration", () => {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  const invoke = vi.fn(async () => undefined);

  bindOverlay(document, invoke);
  document.querySelector<HTMLButtonElement>("[data-action=manager]")?.click();

  expect(invoke).toHaveBeenCalledWith("stop_wall");
});
