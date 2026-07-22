import { wallApi } from "./api";
import { createSaveQueue, swapSlots, validateSlot } from "./state";
import type { AppConfig, OutputInfo, SlotStatus } from "./types";
import { renderSlotCards, statusClass, statusLabel } from "./view";

const POSITIONS = ["좌상", "우상", "좌하", "우하"];

const elements = {
  activeCount: required<HTMLElement>("#active-count"),
  outputResolution: required<HTMLElement>("#output-resolution"),
  outputWarning: required<HTMLElement>("#output-warning"),
  resolutionDialog: required<HTMLDialogElement>("#resolution-dialog"),
  resolutionDialogMessage: required<HTMLElement>("#resolution-dialog-message"),
  runWall: required<HTMLButtonElement>("#run-wall"),
  shortcutHint: required<HTMLElement>("#shortcut-hint"),
  slotEnabled: required<HTMLInputElement>("#slot-enabled"),
  slotGrid: required<HTMLElement>("#slot-grid"),
  slotName: required<HTMLElement>("#slot-name"),
  slotStatus: required<HTMLElement>("#slot-status"),
  slotStatusLabel: required<HTMLElement>("#slot-status-label"),
  slotUrl: required<HTMLInputElement>("#slot-url"),
  slotZoom: required<HTMLInputElement>("#slot-zoom"),
  stopWall: required<HTMLButtonElement>("#stop-wall"),
  systemState: required<HTMLElement>("#system-state"),
  systemStateLabel: required<HTMLElement>("#system-state-label"),
  toast: required<HTMLElement>("#toast"),
  urlMessage: required<HTMLElement>("#url-message"),
  zoomValue: required<HTMLOutputElement>("#zoom-value"),
};

let config: AppConfig | null = null;
let output: OutputInfo | null = null;
let statuses: SlotStatus[] = [];
let selectedIndex = 0;
let wallRunning = false;
let revision = 0;
let savedRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const saveQueue = createSaveQueue(wallApi.saveConfig);

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`required element missing: ${selector}`);
  return element;
}

function currentStatus(index: number): SlotStatus {
  const slot = config?.slots[index];
  if (!slot?.enabled) return { index, state: "disabled", message: "" };
  return statuses[index] ?? { index, state: "idle", message: "" };
}

function renderAll(): void {
  if (!config) return;
  renderSlotCards(elements.slotGrid, config, statuses, selectedIndex, {
    onSelect(index) {
      selectedIndex = index;
      renderAll();
    },
    onSwap(from, to) {
      if (!config) return;
      config.slots = swapSlots(config.slots, from, to);
      statuses[from] = config.slots[from].enabled
        ? { index: from, state: "loading", message: "" }
        : { index: from, state: "disabled", message: "" };
      statuses[to] = config.slots[to].enabled
        ? { index: to, state: "loading", message: "" }
        : { index: to, state: "disabled", message: "" };
      selectedIndex = to;
      scheduleSave(0);
      renderAll();
      showToast(`${POSITIONS[to]} 위치로 화면을 교환함`);
    },
  });
  renderEditor();
  renderOutput();
  renderSummary();
}

function renderEditor(): void {
  if (!config) return;
  const slot = config.slots[selectedIndex];
  const status = currentStatus(selectedIndex);
  elements.slotName.textContent = `화면 ${selectedIndex + 1} · ${POSITIONS[selectedIndex]}`;
  elements.slotEnabled.checked = slot.enabled;
  elements.slotUrl.value = slot.url;
  elements.slotZoom.value = String(Math.round(slot.zoom * 100));
  elements.zoomValue.value = `${Math.round(slot.zoom * 100)}%`;
  elements.slotStatus.className = `slot-status ${statusClass(status.state)}`.trim();
  elements.slotStatusLabel.textContent = statusLabel(status);
  validateSelectedUrl();
}

function renderOutput(): void {
  if (!output) return;
  elements.outputResolution.textContent = `${output.physicalWidth} × ${output.physicalHeight}`;
  elements.outputWarning.hidden = output.isTargetResolution;
}

function renderSummary(): void {
  if (!config) return;
  const active = config.slots.filter((slot) => slot.enabled).length;
  const hasError = statuses.some(
    (status, index) => config?.slots[index]?.enabled && status.state === "error",
  );
  const isLoading = statuses.some(
    (status, index) => config?.slots[index]?.enabled && status.state === "loading",
  );
  elements.activeCount.textContent = `${active} / 4`;
  elements.systemState.className = `system-state ${
    hasError ? "is-error" : isLoading ? "is-loading" : "is-ready"
  }`;
  elements.systemStateLabel.textContent = hasError
    ? "확인 필요"
    : isLoading
      ? "화면 로딩 중"
      : wallRunning
        ? "출력 중"
        : "시스템 준비됨";
  elements.runWall.disabled = wallRunning;
  elements.stopWall.disabled = !wallRunning;
}

function validateSelectedUrl(): boolean {
  if (!config) return false;
  const valid = validateSlot(config.slots[selectedIndex]);
  elements.slotUrl.classList.toggle("is-invalid", !valid);
  elements.urlMessage.classList.toggle("is-error", !valid);
  elements.urlMessage.textContent = valid
    ? "HTTP 또는 HTTPS 주소 입력"
    : "올바른 HTTP 또는 HTTPS URL을 입력해 주세요.";
  return valid;
}

function scheduleSave(delay = 450): void {
  revision += 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void enqueueCurrent(revision), delay);
}

async function enqueueCurrent(targetRevision: number): Promise<void> {
  if (!config || targetRevision <= savedRevision) return;
  try {
    const saved = await saveQueue.enqueue(config);
    savedRevision = Math.max(savedRevision, targetRevision);
    if (targetRevision === revision) config = saved;
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  if (savedRevision < revision) await enqueueCurrent(revision);
  await saveQueue.flush();
}

function showToast(message: string, isError = false): void {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3000);
}

function firstConfigIssue(): number {
  return config?.slots.findIndex((slot) => !validateSlot(slot)) ?? -1;
}

function confirmResolution(): Promise<boolean> {
  if (!output || output.isTargetResolution) return Promise.resolve(true);
  elements.resolutionDialogMessage.textContent =
    `현재 출력은 ${output.physicalWidth}×${output.physicalHeight}임. ` +
    "권장 출력인 3840×2160과 달라 화면 크기가 다르게 보일 수 있음.";
  elements.resolutionDialog.showModal();
  return new Promise((resolve) => {
    elements.resolutionDialog.addEventListener(
      "close",
      () => resolve(elements.resolutionDialog.returnValue === "continue"),
      { once: true },
    );
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

elements.slotUrl.addEventListener("input", () => {
  if (!config) return;
  config.slots[selectedIndex].url = elements.slotUrl.value.trim();
  validateSelectedUrl();
  scheduleSave(700);
});
elements.slotUrl.addEventListener("blur", () => scheduleSave(0));
elements.slotZoom.addEventListener("input", () => {
  if (!config) return;
  config.slots[selectedIndex].zoom = Number(elements.slotZoom.value) / 100;
  elements.zoomValue.value = `${elements.slotZoom.value}%`;
  scheduleSave(200);
});
elements.slotEnabled.addEventListener("change", () => {
  if (!config) return;
  config.slots[selectedIndex].enabled = elements.slotEnabled.checked;
  statuses[selectedIndex] = {
    index: selectedIndex,
    state: elements.slotEnabled.checked ? "loading" : "disabled",
    message: "",
  };
  scheduleSave(0);
  renderAll();
});
elements.runWall.addEventListener("click", async () => {
  const issueIndex = firstConfigIssue();
  if (issueIndex >= 0) {
    selectedIndex = issueIndex;
    renderAll();
    elements.slotUrl.focus();
    showToast(`화면 ${issueIndex + 1}의 URL을 확인해 주세요.`, true);
    return;
  }

  elements.runWall.disabled = true;
  try {
    await flushSave();
    if (!(await confirmResolution())) return;
    await wallApi.run();
    wallRunning = true;
    renderSummary();
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    if (!wallRunning) elements.runWall.disabled = false;
  }
});
elements.stopWall.addEventListener("click", async () => {
  elements.stopWall.disabled = true;
  try {
    await wallApi.stop();
    wallRunning = false;
    renderSummary();
  } catch (error) {
    showToast(errorMessage(error), true);
    elements.stopWall.disabled = false;
  }
});

void wallApi.onStatusChanged((status) => {
  statuses[status.index] = status;
  renderAll();
});
void wallApi.onOutputChanged((nextOutput) => {
  output = nextOutput;
  renderOutput();
});

async function initialize(): Promise<void> {
  try {
    const initial = await wallApi.getInitialState();
    config = initial.config;
    output = initial.output;
    statuses = initial.statuses;
    wallRunning = initial.wallRunning;
    elements.shortcutHint.textContent = `실행 중 ${initial.shortcut}로 관리 화면 복귀`;
    if (initial.warning) showToast(initial.warning, true);
    renderAll();
  } catch (error) {
    elements.systemState.className = "system-state is-error";
    elements.systemStateLabel.textContent = "초기화 실패";
    showToast(errorMessage(error), true);
  }
}

window.addEventListener("focus", () => void initialize());
void initialize();
