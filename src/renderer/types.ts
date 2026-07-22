export interface SlotConfig {
  enabled: boolean;
  url: string;
  zoom: number;
}

export interface AppConfig {
  version: number;
  slots: SlotConfig[];
}

export type SlotState = "idle" | "loading" | "ready" | "error" | "disabled";

export interface SlotStatus {
  index: number;
  state: SlotState;
  message: string;
}

export interface OutputInfo {
  physicalWidth: number;
  physicalHeight: number;
  scaleFactor: number;
  isTargetResolution: boolean;
}

export interface InitialState {
  config: AppConfig;
  output: OutputInfo;
  statuses: SlotStatus[];
  shortcut: string;
  warning: string | null;
  wallRunning: boolean;
}
