import type { AppConfig, SlotStatus, SlotState } from "./types";

const POSITIONS = ["좌상", "우상", "좌하", "우하"];
const STATUS_LABELS: Record<SlotState, string> = {
  idle: "대기 중",
  loading: "로딩 중",
  ready: "정상",
  error: "오류",
  disabled: "사용 안 함",
};

export interface SlotCardActions {
  onSelect?(index: number): void;
  onSwap?(from: number, to: number): void;
  onDragStateChange?(active: boolean): void;
}

export function statusLabel(status: SlotStatus): string {
  const label = STATUS_LABELS[status.state] ?? status.state;
  return status.message ? `${label} · ${status.message}` : label;
}

export function statusClass(state: SlotState): string {
  if (state === "ready") return "is-ready";
  if (state === "loading") return "is-loading";
  if (state === "error") return "is-error";
  return "";
}

export function renderSlotCards(
  container: HTMLElement,
  config: AppConfig,
  statuses: SlotStatus[],
  selectedIndex: number,
  actions: SlotCardActions = {},
): void {
  container.replaceChildren();

  config.slots.forEach((slot, index) => {
    const status = slot.enabled
      ? (statuses[index] ?? { index, state: "idle", message: "" })
      : { index, state: "disabled" as const, message: "" };
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `screen-tile ${statusClass(status.state)}`.trim();
    tile.classList.toggle("is-selected", index === selectedIndex);
    tile.classList.toggle("is-disabled", !slot.enabled);
    tile.draggable = true;
    tile.dataset.index = String(index);
    tile.setAttribute("aria-label", `${POSITIONS[index]} 화면 설정`);
    tile.setAttribute("aria-pressed", String(index === selectedIndex));

    const heading = document.createElement("span");
    heading.className = "tile-heading";
    const number = document.createElement("strong");
    number.textContent = `화면 ${index + 1}`;
    const position = document.createElement("span");
    position.textContent = POSITIONS[index];
    heading.append(number, position);

    const state = document.createElement("span");
    state.className = "tile-state";
    const dot = document.createElement("span");
    dot.className = "status-dot";
    const stateText = document.createElement("span");
    stateText.textContent = statusLabel(status);
    state.append(dot, stateText);

    const url = document.createElement("span");
    url.className = "tile-url";
    url.textContent = slot.url || "URL 미설정";

    const meta = document.createElement("span");
    meta.className = "tile-meta";
    meta.textContent = `${Math.round(slot.zoom * 100)}% · ${slot.enabled ? "사용" : "사용 안 함"}`;
    tile.append(heading, state, url, meta);

    tile.addEventListener("click", () => actions.onSelect?.(index));
    tile.addEventListener("dragstart", (event) => {
      container.dataset.draggedIndex = String(index);
      tile.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      }
      actions.onDragStateChange?.(true);
    });
    tile.addEventListener("dragover", (event) => {
      const draggedIndex = readDraggedIndex(container);
      if (draggedIndex === null || draggedIndex === index) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      tile.classList.add("is-drop-target");
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("is-drop-target"));
    tile.addEventListener("drop", (event) => {
      event.preventDefault();
      const from =
        readDraggedIndex(container) ?? Number(event.dataTransfer?.getData("text/plain"));
      tile.classList.remove("is-drop-target");
      if (Number.isInteger(from) && from !== index) actions.onSwap?.(from, index);
      finishDrag(container, actions);
    });
    tile.addEventListener("dragend", () => finishDrag(container, actions));
    container.append(tile);
  });
}

function readDraggedIndex(container: HTMLElement): number | null {
  const value = Number(container.dataset.draggedIndex);
  return Number.isInteger(value) ? value : null;
}

function finishDrag(container: HTMLElement, actions: SlotCardActions): void {
  delete container.dataset.draggedIndex;
  container.querySelectorAll(".screen-tile").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
  actions.onDragStateChange?.(false);
}
