import { describe, expect, test } from "vitest";
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
});

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
