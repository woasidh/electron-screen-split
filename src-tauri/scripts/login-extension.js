(() => {
  const resultId = "screen-wall-login-extension-result";
  const showResult = (message, success) => {
    try {
      let result = document.getElementById(resultId);
      if (!result) {
        result = document.createElement("div");
        result.id = resultId;
        result.setAttribute("role", "status");
        document.documentElement.append(result);
      }
      result.textContent = `${message} · ${new Date().toLocaleTimeString("ko-KR", {
        hour12: false,
      })}`;
      Object.assign(result.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647",
        padding: "10px 14px",
        borderRadius: "8px",
        background: success ? "rgba(21, 128, 61, .96)" : "rgba(185, 28, 28, .96)",
        color: "#fff",
        font: "600 13px sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, .32)",
        pointerEvents: "none",
      });
      window.clearTimeout(Number(result.dataset.removeTimer || 0));
      result.dataset.removeTimer = String(window.setTimeout(() => result.remove(), 5_000));
    } catch (error) {
      console.warn("[Screen Wall] 로그인 연장 결과 표시 실패", error);
    }
  };

  const candidates = Array.from(document.querySelectorAll("button")).filter((button) => {
    const text = (button.textContent || "").replace(/\s+/g, " ").trim();
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const isLoginStamp = button.classList.contains("stamp")
      && (button.classList.contains("stamp--normal")
        || button.classList.contains("stamp—normal"));
    return isLoginStamp
      && /^\d{2}:\d{2}:\d{2}$/.test(text)
      && !button.disabled
      && button.getAttribute("aria-disabled") !== "true"
      && rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  });

  if (candidates.length === 1) {
    candidates[0].click();
    showResult("로그인 연장 클릭 실행", true);
    console.info("[Screen Wall] 로그인 연장 클릭 실행");
  } else {
    const message = candidates.length === 0
      ? "로그인 연장 대상 버튼 없음"
      : "로그인 연장 대상 버튼 여러 개";
    showResult(message, false);
    console.warn(`[Screen Wall] ${message}`, { candidateCount: candidates.length });
  }
})();
