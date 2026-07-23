import { describe, expect, test, vi } from "vitest";
import { createRenderGate } from "./render-gate";

describe("render gate", () => {
  test("coalesces blocked requests and renders once when unblocked", () => {
    const render = vi.fn();
    const gate = createRenderGate(render);

    gate.setBlocked(true);
    gate.request();
    gate.request();

    expect(render).not.toHaveBeenCalled();

    gate.setBlocked(false);

    expect(render).toHaveBeenCalledTimes(1);
  });

  test("renders requests immediately while unblocked", () => {
    const render = vi.fn();
    const gate = createRenderGate(render);

    gate.request();

    expect(render).toHaveBeenCalledTimes(1);
  });
});
