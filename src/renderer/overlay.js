const panel = window.location.hash.slice(1);
const currentPanel = document.querySelector(`[data-panel="${panel}"]`);
const statusPanel = document.querySelector(".status-panel");
const statusButton = document.querySelector("#status-button");
const statusLabel = document.querySelector("#status-label");

let status = { hasError: false };
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

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => window.wallOverlay.action(button.dataset.action));
});

statusButton.addEventListener("click", () => {
  if (status.hasError) window.wallOverlay.action("manager");
});

window.wallOverlay.onStatus((nextStatus) => {
  status = nextStatus;
  statusLabel.textContent = nextStatus.label;
  statusPanel.classList.toggle("is-ready", nextStatus.state === "ready");
  statusPanel.classList.toggle("is-error", nextStatus.state === "error");
  statusButton.disabled = !nextStatus.hasError;
});
