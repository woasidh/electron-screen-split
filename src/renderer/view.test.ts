import { describe, expect, test, vi } from "vitest";
import managerMarkup from "./index.html?raw";
import { renderSlotCards } from "./view";
import type { AppConfig, SlotStatus } from "./types";

describe("manager view", () => {
  test("renders four status cards and contains no preview UI", () => {
    const parsed = new DOMParser().parseFromString(managerMarkup, "text/html");
    document.body.innerHTML = parsed.body.innerHTML;
    const container = document.querySelector<HTMLElement>("#slot-grid");
    if (!container) throw new Error("slot grid fixture missing");

    renderSlotCards(container, defaultConfig(), defaultStatuses(), 0);

    expect(document.querySelectorAll(".screen-tile")).toHaveLength(4);
    expect(document.body.textContent).not.toContain("미리보기");
    expect(document.body.textContent).not.toContain("5초 자동 갱신");
    expect(document.querySelectorAll(".preview-image")).toHaveLength(0);
  });

  test("keeps the drag source when cards rerender before drop", () => {
    const container = document.createElement("div");
    const config = defaultConfig();
    const statuses = defaultStatuses();
    const onSwap = vi.fn();
    const onDragStateChange = vi.fn();
    const actions = { onSwap, onDragStateChange };

    renderSlotCards(container, config, statuses, 0, actions);
    slotTiles(container)[0].dispatchEvent(new Event("dragstart", { bubbles: true }));

    renderSlotCards(container, config, statuses, 0, actions);
    slotTiles(container)[1].dispatchEvent(
      new Event("drop", { bubbles: true, cancelable: true }),
    );

    expect(onSwap).toHaveBeenCalledWith(0, 1);
    expect(onDragStateChange.mock.calls).toEqual([[true], [false]]);
  });

  test("uses a one-pixel transparent native drag image", () => {
    document.body.replaceChildren();
    const container = document.createElement("div");
    document.body.append(container);
    renderSlotCards(container, defaultConfig(), defaultStatuses(), 0);

    const setDragImage = vi.fn();
    const dataTransfer = {
      effectAllowed: "none",
      setData: vi.fn(),
      setDragImage,
    } as unknown as DataTransfer;
    const dragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });

    slotTiles(container)[0].dispatchEvent(dragStart);

    expect(setDragImage).toHaveBeenCalledOnce();
    const [dragImage, offsetX, offsetY] = setDragImage.mock.calls[0] as [
      HTMLCanvasElement,
      number,
      number,
    ];
    expect(dragImage).toBeInstanceOf(HTMLCanvasElement);
    expect(dragImage.width).toBe(1);
    expect(dragImage.height).toBe(1);
    expect([offsetX, offsetY]).toEqual([0, 0]);
    expect(document.body.contains(dragImage)).toBe(true);

    slotTiles(container)[0].dispatchEvent(new Event("dragend", { bubbles: true }));

    expect(document.body.contains(dragImage)).toBe(false);
  });
});

function slotTiles(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".screen-tile"));
}

function defaultConfig(): AppConfig {
  return {
    version: 1,
    slots: Array.from({ length: 4 }, (_, index) => ({
      enabled: true,
      url: `https://${index + 1}.example`,
      zoom: 1,
    })),
  };
}

function defaultStatuses(): SlotStatus[] {
  return Array.from({ length: 4 }, (_, index) => ({
    index,
    state: "idle",
    message: "",
  }));
}
