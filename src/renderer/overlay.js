const panel = window.location.hash.slice(1);
const currentPanel = document.querySelector(`[data-panel="${panel}"]`);

let lastActivityAt = 0;

if (currentPanel) currentPanel.hidden = false;

document.addEventListener("pointerenter", () => window.wallOverlay.hover(panel, true));
document.addEventListener("pointerleave", () => window.wallOverlay.hover(panel, false));
document.addEventListener("pointermove", () => {
  const now = Date.now();
  if (now - lastActivityAt < 100) return;
  lastActivityAt = now;
  window.wallOverlay.activity(panel);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  window.wallOverlay.action("manager");
});
