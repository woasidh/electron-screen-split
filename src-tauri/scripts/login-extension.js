(() => {
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

  if (candidates.length === 1) candidates[0].click();
})();
