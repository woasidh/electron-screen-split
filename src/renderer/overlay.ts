import { invoke } from "@tauri-apps/api/core";

type InvokeCommand = (command: string) => Promise<unknown>;

export function bindOverlay(root: Document, call: InvokeCommand = invoke): void {
  const restore = (): void => {
    void call("stop_wall");
  };
  root.querySelector("[data-action=manager]")?.addEventListener("click", restore);
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    restore();
  });
}

bindOverlay(document);
