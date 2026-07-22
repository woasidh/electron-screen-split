import type { AppConfig, SlotConfig } from "./types";

export function swapSlots(slots: SlotConfig[], from: number, to: number): SlotConfig[] {
  if (!slots[from] || !slots[to]) {
    throw new RangeError("slot index is out of bounds");
  }

  const next = structuredClone(slots);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function validateSlot(slot: SlotConfig): boolean {
  if (!slot.enabled) return true;

  try {
    return ["http:", "https:"].includes(new URL(slot.url).protocol);
  } catch {
    return false;
  }
}

export interface SaveQueue {
  enqueue(config: AppConfig): Promise<AppConfig>;
  flush(): Promise<void>;
}

export function createSaveQueue(
  save: (config: AppConfig) => Promise<AppConfig>,
): SaveQueue {
  let tail = Promise.resolve();

  return {
    enqueue(config) {
      const snapshot = structuredClone(config);
      const operation = tail.then(() => save(snapshot));
      tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    flush() {
      return tail;
    },
  };
}
