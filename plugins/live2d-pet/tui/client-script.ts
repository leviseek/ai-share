export const clientScript: string = String.raw`
let live2dRuntimeReady = false;

function tryLoadExternalLive2D() {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js";
  script.async = true;
  script.onload = () => {
    if (!window.L2Dwidget) {
      return;
    }
    live2dRuntimeReady = true;
    window.L2Dwidget.init({
      model: { jsonPath: "https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo/assets/tororo.model.json", scale: 1 },
      display: { position: "left", width: 160, height: 320, hOffset: 0, vOffset: -20 },
      mobile: { show: true, scale: 0.7 },
      dialog: { enable: false },
    });
  };
  script.onerror = () => {};
  document.head.appendChild(script);
}

tryLoadExternalLive2D();
`;
