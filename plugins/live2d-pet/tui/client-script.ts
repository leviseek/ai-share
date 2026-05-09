export const clientScript: string = String.raw`
const status = document.getElementById("status");
const closeBtn = document.getElementById("closeBtn");
const waveBtn = document.getElementById("waveBtn");
const blinkBtn = document.getElementById("blinkBtn");
const idleBtn = document.getElementById("idleBtn");
const modelList = document.getElementById("modelList");
const canvas = document.getElementById("petCanvas");
const globalWindow = window;

const modelSources = [
  {
    id: "cat-tororo",
    label: "可爱小猫 · Tororo",
    description: "优先资源，使用官方/公开分发的猫模型。",
    jsonPath: "https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo/assets/tororo.model.json",
    mood: "cat",
  },
  {
    id: "anime-miku",
    label: "二次元角色 · Miku",
    description: "猫资源不可用时的备用模型。",
    jsonPath: "https://cdn.jsdelivr.net/npm/live2d-widget-model-miku/assets/miku.model.json",
    mood: "anime",
  },
];

const state = {
  currentSource: modelSources[0],
  mode: "idle",
  lastInteractionAt: Date.now(),
};

let renderFrame = 0;
let time = 0;
let live2dRuntimeReady = false;

closeBtn.addEventListener("click", () => {
  document.body.classList.toggle("collapsed");
  closeBtn.textContent = document.body.classList.contains("collapsed") ? "展开" : "收起";
});

waveBtn.addEventListener("click", () => {
  state.mode = "wave";
  state.lastInteractionAt = Date.now();
  syncStatus("正在向你挥手。");
});

blinkBtn.addEventListener("click", () => {
  state.mode = "blink";
  state.lastInteractionAt = Date.now();
  syncStatus("宠物眨了眨眼。");
});

idleBtn.addEventListener("click", () => {
  state.mode = "idle";
  state.lastInteractionAt = Date.now();
  syncStatus("回到待机姿态。");
});

function syncStatus(message) {
  status.textContent = message + " 当前模型：" + state.currentSource.label;
}

function renderModelButtons() {
  modelList.innerHTML = modelSources.map((source) => {
    const active = source.id === state.currentSource.id ? "active" : "";
    return (
      '<button class="model-button ' +
      active +
      '" data-model="' +
      source.id +
      '" type="button"><strong>' +
      source.label +
      '</strong><br><span>' +
      source.description +
      '</span></button>'
    );
  }).join("");

  modelList.querySelectorAll("[data-model]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = modelSources.find((source) => source.id === button.dataset.model);
      if (!next) return;
      state.currentSource = next;
      state.mode = "idle";
      state.lastInteractionAt = Date.now();
      syncStatus("已切换到 " + next.label + "。");
      renderModelButtons();
      initExternalModel();
    });
  });
}

function removeExternalModelNodes() {
  document.querySelectorAll("#live2dcanvas, .live2d-widget-container, .live2d-widget-dialog").forEach((node) => {
    node.remove();
  });
}

function initExternalModel() {
  if (!live2dRuntimeReady || !globalWindow.L2Dwidget) return;
  removeExternalModelNodes();
  globalWindow.L2Dwidget.init({
    model: { jsonPath: state.currentSource.jsonPath, scale: 1 },
    display: { position: "left", width: 160, height: 320, hOffset: 0, vOffset: -20 },
    mobile: { show: true, scale: 0.7 },
    dialog: { enable: false },
  });
}

function drawFallbackPlaceholder(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.35, 20, width * 0.5, height * 0.4, width * 0.45);
  gradient.addColorStop(0, "rgba(125, 211, 252, 0.28)");
  gradient.addColorStop(1, "rgba(96, 165, 250, 0.03)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.font = "700 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Live2D Pet", width / 2, height / 2 - 18);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
  ctx.fillText(state.currentSource.label, width / 2, height / 2 + 12);
  ctx.fillText("资源加载后这里会显示实时模型。", width / 2, height / 2 + 34);
}

function tick() {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  time += 0.016;
  drawFallbackPlaceholder(ctx, width, height);

  const bob = Math.sin(time * 2.2) * 10;
  const bounce = state.mode === "wave" ? Math.sin(time * 9) * 8 : state.mode === "blink" ? Math.cos(time * 16) * 2 : 0;

  ctx.save();
  ctx.translate(width / 2, height / 2 + bob);
  ctx.fillStyle = "rgba(125, 211, 252, 0.92)";
  ctx.beginPath();
  ctx.ellipse(0, -26 + bounce, 118, 110, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.arc(-34, -42, 10, 0, Math.PI * 2);
  ctx.arc(34, -42, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.beginPath();
  ctx.arc(-34, -42, state.mode === "blink" ? 2 : 4, 0, Math.PI * 2);
  ctx.arc(34, -42, state.mode === "blink" ? 2 : 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(15, 23, 42, 0.88)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -8, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.beginPath();
  ctx.moveTo(-62, -114);
  ctx.lineTo(-96, -154);
  ctx.lineTo(-34, -140);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(62, -114);
  ctx.lineTo(96, -154);
  ctx.lineTo(34, -140);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-36, 40);
  ctx.quadraticCurveTo(0, 70 + bounce, 36, 40);
  ctx.stroke();

  if (state.mode === "wave") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-112, 22);
    ctx.quadraticCurveTo(-156, -18 - Math.sin(time * 10) * 8, -126, -72);
    ctx.stroke();
  }

  ctx.restore();
  renderFrame = window.requestAnimationFrame(tick);
}

function tryLoadExternalLive2D() {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js";
  script.async = true;
  script.onload = () => {
    if (!globalWindow.L2Dwidget) {
      syncStatus("Live2D 运行时未能初始化，已回退到本地占位画布。");
      return;
    }
    live2dRuntimeReady = true;
    syncStatus("Live2D 运行时已加载，若模型资源可达则会渲染真实模型。");
    initExternalModel();
  };
  script.onerror = () => syncStatus("Live2D 运行时加载失败，使用本地占位画布。");
  document.head.appendChild(script);
}

renderModelButtons();
syncStatus("正在准备 Live2D 资源…");
tryLoadExternalLive2D();
tick();
`;
