import { describe, expect, test, vi } from "vitest";
import { createSaveQueue, swapSlots, validateSlot } from "./state";
import type { AppConfig, SlotConfig } from "./types";

describe("manager state", () => {
  test("swaps complete slot settings without mutating input", () => {
    const slots: SlotConfig[] = [
      { enabled: true, url: "https://one.example", zoom: 1, loginExtension: true },
      { enabled: false, url: "", zoom: 1.2, loginExtension: false },
    ];

    expect(swapSlots(slots, 0, 1)).toEqual([slots[1], slots[0]]);
    expect(slots[0].url).toBe("https://one.example");
    expect(swapSlots(slots, 0, 1)[1].loginExtension).toBe(true);
  });

  test("rejects non-http URL only when enabled", () => {
    expect(
      validateSlot({ enabled: true, url: "file:///tmp/a", zoom: 1, loginExtension: false }),
    ).toBe(false);
    expect(validateSlot({ enabled: false, url: "", zoom: 1, loginExtension: false })).toBe(true);
  });

  test("serializes saves so older writes cannot win", async () => {
    const calls: string[] = [];
    const save = vi.fn(async (config: AppConfig) => {
      calls.push(config.slots[0].url);
      await Promise.resolve();
      return config;
    });
    const queue = createSaveQueue(save);
    const first = configWithUrl("https://one.example");
    const second = configWithUrl("https://two.example");

    await Promise.all([queue.enqueue(first), queue.enqueue(second)]);

    expect(calls).toEqual(["https://one.example", "https://two.example"]);
  });
});

function configWithUrl(url: string): AppConfig {
  return {
    version: 1,
    slots: Array.from({ length: 4 }, () => ({
      enabled: true,
      url,
      zoom: 1,
      loginExtension: false,
    })),
  };
}
