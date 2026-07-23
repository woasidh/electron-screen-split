export interface RenderGate {
  request(): void;
  setBlocked(blocked: boolean): void;
}

export function createRenderGate(render: () => void): RenderGate {
  let blocked = false;
  let pending = false;

  return {
    request() {
      if (blocked) {
        pending = true;
        return;
      }
      pending = false;
      render();
    },
    setBlocked(nextBlocked) {
      blocked = nextBlocked;
      if (blocked || !pending) return;
      pending = false;
      render();
    },
  };
}
