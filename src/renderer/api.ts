import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppConfig, InitialState, OutputInfo, SlotStatus } from "./types";

export const wallApi = {
  getInitialState(): Promise<InitialState> {
    return invoke<InitialState>("get_initial_state");
  },
  saveConfig(config: AppConfig): Promise<AppConfig> {
    return invoke<AppConfig>("save_config", { config });
  },
  run(): Promise<void> {
    return invoke<void>("run_wall");
  },
  stop(): Promise<void> {
    return invoke<void>("stop_wall");
  },
  onStatusChanged(handler: (status: SlotStatus) => void): Promise<UnlistenFn> {
    return listen<SlotStatus>("slot-status-changed", (event) => handler(event.payload));
  },
  onOutputChanged(handler: (output: OutputInfo) => void): Promise<UnlistenFn> {
    return listen<OutputInfo>("output-changed", (event) => handler(event.payload));
  },
};
