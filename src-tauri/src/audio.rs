pub const MUTE_SCRIPT: &str = r#"
(() => {
  const muteElement = (element) => {
    element.muted = true;
    element.volume = 0;
  };
  const muteTree = (root) => {
    if (root.matches?.("audio,video")) muteElement(root);
    root.querySelectorAll?.("audio,video").forEach(muteElement);
  };
  const startObserver = () => {
    muteTree(document);
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) muteTree(node);
      }));
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver, { once: true });

  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  if (NativeAudioContext) {
    class MutedAudioContext extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        this.suspend().catch(() => {});
      }
      resume() { return this.suspend(); }
    }
    window.AudioContext = MutedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = MutedAudioContext;
  }
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mute_script_covers_media_elements_and_audio_context() {
        assert!(MUTE_SCRIPT.contains("MutationObserver"));
        assert!(MUTE_SCRIPT.contains("AudioContext"));
        assert!(MUTE_SCRIPT.contains("muted = true"));
        assert!(MUTE_SCRIPT.contains("volume = 0"));
    }
}
