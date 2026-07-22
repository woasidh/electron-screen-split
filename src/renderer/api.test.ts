import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AppConfig } from "./types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  listen: vi.fn<(event: string, handler: unknown) => Promise<() => void>>(
    async () => () => undefined,
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

import { wallApi } from "./api";

describe("Tauri command adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  test("uses only the manager command contract", async () => {
    const config: AppConfig = { version: 1, slots: [] };

    await wallApi.getInitialState();
    await wallApi.saveConfig(config);
    await wallApi.run();
    await wallApi.stop();

    expect(mocks.invoke.mock.calls).toEqual([
      ["get_initial_state"],
      ["save_config", { config }],
      ["run_wall"],
      ["stop_wall"],
    ]);
  });

  test("subscribes to status and output events", async () => {
    await wallApi.onStatusChanged(() => undefined);
    await wallApi.onOutputChanged(() => undefined);

    expect(mocks.listen.mock.calls.map(([event]) => event)).toEqual([
      "slot-status-changed",
      "output-changed",
    ]);
  });
});
