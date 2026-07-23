import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import loginExtensionScript from "../../src-tauri/scripts/login-extension.js?raw";

const RESULT_ID = "screen-wall-login-extension-result";

describe("login extension click script", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.body.replaceChildren();
    resultNotice()?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("clicks one visible enabled time button and shows the result", () => {
    const button = addButton("23:35:32");
    const click = vi.spyOn(button, "click");

    runScript();

    expect(click).toHaveBeenCalledOnce();
    expect(resultNotice()?.textContent).toContain("로그인 연장 클릭 실행");
    expect(resultNotice()?.style.pointerEvents).toBe("none");
    expect(console.info).toHaveBeenCalledWith("[Screen Wall] 로그인 연장 클릭 실행");

    vi.advanceTimersByTime(5_000);

    expect(resultNotice()).toBeNull();
  });

  test("does not click when multiple time buttons match", () => {
    const first = addButton("23:35:32");
    const second = addButton("00:35:32");
    const firstClick = vi.spyOn(first, "click");
    const secondClick = vi.spyOn(second, "click");

    runScript();

    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).not.toHaveBeenCalled();
    expect(resultNotice()?.textContent).toContain("로그인 연장 대상 버튼 여러 개");
    expect(console.warn).toHaveBeenCalledWith(
      "[Screen Wall] 로그인 연장 대상 버튼 여러 개",
      { candidateCount: 2 },
    );
  });

  test("reports no target for time buttons without stamp classes", () => {
    const button = addButton("23:35:32", false);
    const click = vi.spyOn(button, "click");

    runScript();

    expect(click).not.toHaveBeenCalled();
    expect(resultNotice()?.textContent).toContain("로그인 연장 대상 버튼 없음");
    expect(console.warn).toHaveBeenCalledWith(
      "[Screen Wall] 로그인 연장 대상 버튼 없음",
      { candidateCount: 0 },
    );
  });

  test("accepts the em dash spelling supplied by the target page", () => {
    const button = addButton("23:35:32");
    button.classList.replace("stamp--normal", "stamp—normal");
    const click = vi.spyOn(button, "click");

    runScript();

    expect(click).toHaveBeenCalledOnce();
  });

  test("ignores hidden and disabled time buttons", () => {
    const valid = addButton(" 23:35:32 ");
    const hidden = addButton("23:35:33");
    hidden.style.display = "none";
    const disabled = addButton("23:35:34");
    disabled.disabled = true;
    const ariaDisabled = addButton("23:35:35");
    ariaDisabled.setAttribute("aria-disabled", "true");
    const validClick = vi.spyOn(valid, "click");
    const hiddenClick = vi.spyOn(hidden, "click");
    const disabledClick = vi.spyOn(disabled, "click");
    const ariaDisabledClick = vi.spyOn(ariaDisabled, "click");

    runScript();

    expect(validClick).toHaveBeenCalledOnce();
    expect(hiddenClick).not.toHaveBeenCalled();
    expect(disabledClick).not.toHaveBeenCalled();
    expect(ariaDisabledClick).not.toHaveBeenCalled();
  });
});

function addButton(text: string, isStamp = true): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = text;
  if (isStamp) button.classList.add("stamp", "stamp--normal");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    width: 80,
    height: 30,
  } as DOMRect);
  document.body.append(button);
  return button;
}

function runScript(): void {
  Function(loginExtensionScript)();
}

function resultNotice(): HTMLElement | null {
  return document.getElementById(RESULT_ID);
}
