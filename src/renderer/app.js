const POSITIONS = ["좌상", "우상", "좌하", "우하"];
const STATUS_LABELS = {
  idle: "대기 중",
  loading: "로딩 중",
  ready: "정상",
  error: "오류",
  disabled: "사용 안 함",
};
const DRAG_IMAGE_SELECTOR = "canvas[data-slot-drag-image]";

const api = window.wallControl;

const elements = {
  activeCount: document.querySelector("#active-count"),
  outputResolution: document.querySelector("#output-resolution"),
  outputWarning: document.querySelector("#output-warning"),
  previewState: document.querySelector("#preview-state"),
  previewUpdated: document.querySelector("#preview-updated"),
  resolutionDialog: document.querySelector("#resolution-dialog"),
  resolutionDialogMessage: document.querySelector("#resolution-dialog-message"),
  runWall: document.querySelector("#run-wall"),
  shortcutHint: document.querySelector("#shortcut-hint"),
  slotEnabled: document.querySelector("#slot-enabled"),
  slotLoginExtension: document.querySelector("#slot-login-extension"),
  slotName: document.querySelector("#slot-name"),
  slotStatus: document.querySelector("#slot-status"),
  slotStatusLabel: document.querySelector("#slot-status-label"),
  slotUrl: document.querySelector("#slot-url"),
  slotZoom: document.querySelector("#slot-zoom"),
  systemState: document.querySelector("#system-state"),
  systemStateLabel: document.querySelector("#system-state-label"),
  toast: document.querySelector("#toast"),
  urlMessage: document.querySelector("#url-message"),
  wallFrame: document.querySelector("#wall-frame"),
  zoomValue: document.querySelector("#zoom-value"),
};

let config = null;
let output = null;
let previews = Array.from({ length: 4 }, () => null);
let statuses = Array.from({ length: 4 }, () => ({ state: "idle", message: "" }));
let selectedIndex = 0;
let gridRenderPending = false;
let saveTimer = null;
let toastTimer = null;
let mutationRevision = 0;
let queuedRevision = 0;
let savedRevision = 0;
let saveQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatRefreshTime(timestamp) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp || Date.now()));
}

function isSafeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getStatus(index) {
  if (!config.slots[index].enabled) return { state: "disabled", message: "" };
  return statuses[index] || { state: "idle", message: "" };
}

function getStatusClass(state) {
  if (state === "ready") return "is-ready";
  if (state === "loading") return "is-loading";
  if (state === "error") return "is-error";
  return "";
}

function requestGridRender() {
  if (elements.wallFrame.dataset.draggedIndex !== undefined) {
    gridRenderPending = true;
    return;
  }
  renderGrid();
}

function readDraggedIndex() {
  const value = Number(elements.wallFrame.dataset.draggedIndex);
  return Number.isInteger(value) ? value : null;
}

function finishDrag() {
  delete elements.wallFrame.dataset.draggedIndex;
  document.querySelector(DRAG_IMAGE_SELECTOR)?.remove();
  document.querySelectorAll(".screen-tile").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
  if (gridRenderPending) {
    gridRenderPending = false;
    renderGrid();
  }
}

function installDragImage(dataTransfer, index, url) {
  document.querySelector(DRAG_IMAGE_SELECTOR)?.remove();
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 72;
  canvas.dataset.slotDragImage = "";
  Object.assign(canvas.style, {
    position: "fixed",
    left: "-9999px",
    top: "-9999px",
    width: "180px",
    height: "72px",
    pointerEvents: "none",
  });
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#20242c";
    context.fillRect(0, 0, 180, 72);
    context.strokeStyle = "#6ea8fe";
    context.lineWidth = 2;
    context.strokeRect(1, 1, 178, 70);
    context.fillStyle = "#f5f7fa";
    context.font = "600 14px sans-serif";
    context.fillText(`화면 ${index + 1} · ${POSITIONS[index]}`, 12, 27, 156);
    context.fillStyle = "#9ba3af";
    context.font = "12px sans-serif";
    context.fillText(url || "URL 미설정", 12, 51, 156);
  }
  document.body.append(canvas);
  dataTransfer.setDragImage(canvas, 90, 36);
}

function renderGrid() {
  elements.wallFrame.replaceChildren();

  config.slots.forEach((slot, index) => {
    const status = getStatus(index);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "screen-tile";
    tile.classList.toggle("is-selected", index === selectedIndex);
    tile.classList.toggle("is-disabled", !slot.enabled);
    tile.draggable = true;
    tile.dataset.index = String(index);
    tile.setAttribute("aria-label", `${POSITIONS[index]} 화면 설정`);
    tile.setAttribute("aria-pressed", String(index === selectedIndex));

    const preview = previews[index];
    if (preview?.dataUrl) {
      const image = document.createElement("img");
      image.className = "preview-image";
      image.src = preview.dataUrl;
      image.alt = `${POSITIONS[index]} 화면 미리보기`;
      image.draggable = false;
      tile.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "preview-placeholder";
      placeholder.textContent = slot.enabled ? STATUS_LABELS[status.state] : "사용 안 함";
      tile.append(placeholder);
    }

    const top = document.createElement("span");
    top.className = "tile-top";
    const position = document.createElement("span");
    position.className = "position-label";
    position.textContent = POSITIONS[index];
    const tileState = document.createElement("span");
    tileState.className = "tile-state";
    const dot = document.createElement("span");
    dot.className = `status-dot ${getStatusClass(status.state)}`;
    const stateLabel = document.createElement("span");
    stateLabel.textContent = STATUS_LABELS[status.state] || status.state;
    tileState.append(dot, stateLabel);
    top.append(position, tileState);

    const url = document.createElement("span");
    url.className = "tile-url";
    url.textContent = slot.url || "URL 미설정";
    const meta = document.createElement("span");
    meta.className = "tile-meta";
    meta.textContent = [
      `${Math.round(slot.zoom * 100)}%`,
      slot.enabled ? "사용" : "사용 안 함",
      ...(slot.loginExtension ? ["로그인 연장"] : []),
    ].join(" · ");
    tile.append(top, url, meta);

    tile.addEventListener("click", () => {
      selectedIndex = index;
      requestGridRender();
      renderEditor();
    });

    tile.addEventListener("dragstart", (event) => {
      elements.wallFrame.dataset.draggedIndex = String(index);
      tile.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        installDragImage(event.dataTransfer, index, slot.url);
      }
    });

    tile.addEventListener("dragover", (event) => {
      const draggedIndex = readDraggedIndex();
      if (draggedIndex === null || draggedIndex === index) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      tile.classList.add("is-drop-target");
    });

    tile.addEventListener("dragleave", () => tile.classList.remove("is-drop-target"));

    tile.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedIndex =
        readDraggedIndex() ?? Number(event.dataTransfer?.getData("text/plain"));
      if (!Number.isInteger(draggedIndex) || draggedIndex === index) {
        finishDrag();
        return;
      }
      [config.slots[draggedIndex], config.slots[index]] = [
        config.slots[index],
        config.slots[draggedIndex],
      ];
      [previews[draggedIndex], previews[index]] = [previews[index], previews[draggedIndex]];
      statuses[draggedIndex] = config.slots[draggedIndex].enabled
        ? { state: "loading", message: "" }
        : { state: "disabled", message: "" };
      statuses[index] = config.slots[index].enabled
        ? { state: "loading", message: "" }
        : { state: "disabled", message: "" };
      selectedIndex = index;
      finishDrag();
      renderAll();
      markChanged(0);
      showToast(`${POSITIONS[index]} 위치로 화면을 교환함`);
    });

    tile.addEventListener("dragend", finishDrag);

    elements.wallFrame.append(tile);
  });
}

function renderEditor() {
  const slot = config.slots[selectedIndex];
  const status = getStatus(selectedIndex);
  elements.slotName.textContent = `화면 ${selectedIndex + 1} · ${POSITIONS[selectedIndex]}`;
  elements.slotEnabled.checked = slot.enabled;
  elements.slotLoginExtension.checked = slot.loginExtension;
  elements.slotUrl.value = slot.url;
  elements.slotZoom.value = String(Math.round(slot.zoom * 100));
  elements.zoomValue.value = `${Math.round(slot.zoom * 100)}%`;
  elements.slotStatus.className = `slot-status ${getStatusClass(status.state)}`;
  elements.slotStatusLabel.textContent = status.message
    ? `${STATUS_LABELS[status.state]} · ${status.message}`
    : STATUS_LABELS[status.state] || status.state;
  validateSelectedUrl();
}

function renderOutput() {
  if (!output) return;
  elements.outputResolution.textContent = `${output.physicalWidth} × ${output.physicalHeight}`;
  elements.outputWarning.hidden = output.isTargetResolution;
}

function renderSummary() {
  const active = config.slots.filter((slot) => slot.enabled).length;
  const hasError = statuses.some((status, index) => config.slots[index].enabled && status.state === "error");
  const isLoading = statuses.some((status, index) => config.slots[index].enabled && status.state === "loading");
  elements.activeCount.textContent = `${active} / 4`;
  elements.systemState.className = `system-state ${hasError ? "is-error" : isLoading ? "is-loading" : "is-ready"}`;
  elements.systemStateLabel.textContent = hasError ? "확인 필요" : isLoading ? "화면 로딩 중" : "시스템 준비됨";
}

function renderAll() {
  renderOutput();
  requestGridRender();
  renderEditor();
  renderSummary();
}

function validateSelectedUrl() {
  const slot = config.slots[selectedIndex];
  const valid = !slot.enabled || isSafeUrl(slot.url);
  elements.slotUrl.classList.toggle("is-invalid", !valid);
  elements.urlMessage.classList.toggle("is-error", !valid);
  elements.urlMessage.textContent = valid
    ? "HTTP 또는 HTTPS 주소 입력"
    : "올바른 HTTP 또는 HTTPS URL을 입력해 주세요.";
  return valid;
}

function markChanged(delay = 500) {
  mutationRevision += 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => enqueueSave(mutationRevision), delay);
}

function enqueueSave(revision) {
  if (revision <= queuedRevision) return saveQueue;
  queuedRevision = revision;
  const snapshot = clone(config);

  saveQueue = saveQueue
    .then(async () => {
      const saved = await api.saveConfig(snapshot);
      savedRevision = Math.max(savedRevision, revision);
      if (revision === mutationRevision) {
        config = saved;
      }
    })
    .catch((error) => {
      queuedRevision = savedRevision;
      showToast(error.message, true);
    });

  return saveQueue;
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (savedRevision < mutationRevision) enqueueSave(mutationRevision);
  await saveQueue;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3000);
}

function getFirstConfigIssue() {
  return config.slots.findIndex((slot) => slot.enabled && !isSafeUrl(slot.url));
}

function confirmResolution() {
  if (output?.isTargetResolution) return Promise.resolve(true);
  elements.resolutionDialogMessage.textContent = `현재 출력은 ${output.physicalWidth}×${output.physicalHeight}임. 비디오월 권장 출력인 3840×2160이 아니므로 화면이 다르게 보일 수 있음.`;
  elements.resolutionDialog.showModal();
  return new Promise((resolve) => {
    elements.resolutionDialog.addEventListener(
      "close",
      () => resolve(elements.resolutionDialog.returnValue === "continue"),
      { once: true },
    );
  });
}

elements.slotUrl.addEventListener("input", () => {
  config.slots[selectedIndex].url = elements.slotUrl.value.trim();
  validateSelectedUrl();
  requestGridRender();
  markChanged(700);
});

elements.slotUrl.addEventListener("blur", () => markChanged(0));

elements.slotZoom.addEventListener("input", () => {
  config.slots[selectedIndex].zoom = Number(elements.slotZoom.value) / 100;
  elements.zoomValue.value = `${elements.slotZoom.value}%`;
  markChanged(200);
});

elements.slotEnabled.addEventListener("change", () => {
  config.slots[selectedIndex].enabled = elements.slotEnabled.checked;
  statuses[selectedIndex] = { state: elements.slotEnabled.checked ? "loading" : "disabled", message: "" };
  renderAll();
  markChanged(0);
});

elements.slotLoginExtension.addEventListener("change", () => {
  config.slots[selectedIndex].loginExtension = elements.slotLoginExtension.checked;
  renderAll();
  markChanged(0);
});

elements.runWall.addEventListener("click", async () => {
  const issueIndex = getFirstConfigIssue();
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
    await api.run();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.runWall.disabled = false;
  }
});

api.onStatusChanged((status) => {
  statuses[status.index] = status;
  if (config) {
    requestGridRender();
    renderEditor();
    renderSummary();
  }
});

api.onPreviewUpdated((preview) => {
  previews[preview.index] = preview;
  elements.previewState.textContent = "5초 자동 갱신";
  elements.previewUpdated.textContent = `${formatRefreshTime(preview.capturedAt)} 자동 갱신됨`;
  if (config) requestGridRender();
});

api.onOutputChanged((nextOutput) => {
  output = nextOutput;
  renderOutput();
});

async function initialize() {
  if (!api) {
    elements.systemStateLabel.textContent = "Electron 연결 실패";
    return;
  }

  try {
    const initial = await api.getInitialState();
    config = initial.config;
    output = initial.output;
    previews = initial.previews;
    statuses = initial.statuses;
    elements.shortcutHint.textContent = `실행 중 ${initial.shortcut}로 관리 화면 복귀`;
    elements.previewState.textContent = "5초 자동 갱신";
    renderAll();
  } catch (error) {
    elements.systemState.className = "system-state is-error";
    elements.systemStateLabel.textContent = "초기화 실패";
    showToast(error.message, true);
  }
}

initialize();
