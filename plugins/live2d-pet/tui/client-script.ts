export const clientScript: string = String.raw`
function installNativeDragging() {
  const shell = document.getElementById("live2d-shell");
  if (!(shell instanceof HTMLElement)) return;

  window.setTimeout(async () => {
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: -1, y: -1 });
    } catch {
      // ignore probe failures
    }
  }, 500);

  shell.textContent = "DRAG TEST";

  shell.addEventListener("pointerdown", async (event) => {
    if (event.button !== 0) return;
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: event.clientX, y: event.clientY });
      await window.__TAURI__?.core?.invoke?.("start_dragging");
      event.preventDefault();
    } catch {
      // If the JS API is unavailable, the native drag region still applies.
    }
  });
}

installNativeDragging();
`;
