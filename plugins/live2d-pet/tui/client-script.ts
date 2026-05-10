export const clientScript: string = String.raw`
const MODEL_URL = "https://cdn.jsdelivr.net/npm/live2d-lib@1.0.9/live2d/models/tororo/tororo.model3.json";
const SCRIPT_URLS = [
  "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js",
  "https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js",
  "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js",
];
const CLICK_MOTION_GROUPS = ["TapBody", "TapLeft", "TapRight"];
const IDLE_MOTION_GROUPS = ["Idle", "TapBody", "TapLeft", "TapRight"];
const MIN_IDLE_DELAY_MS = 22000;
const IDLE_DELAY_JITTER_MS = 18000;

let live2dModel;
let idleTimer;
let motionGroups = { click: [], idle: [] };

function setStatus(message, ready = false) {
  const status = document.getElementById("live2d-status");
  if (!(status instanceof HTMLElement)) return;
  status.textContent = message;
  status.dataset.ready = String(ready);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("无法加载 " + src)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("无法加载 " + src));
    document.head.appendChild(script);
  });
}

async function loadLive2dRuntime() {
  for (const src of SCRIPT_URLS) {
    await loadScript(src);
  }
  if (!window.PIXI?.live2d?.Live2DModel) {
    throw new Error("Live2D runtime 未初始化");
  }
}

async function loadMotionGroups() {
  const response = await fetch(MODEL_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("无法读取 Tororo 模型配置");
  }
  const model = await response.json();
  const motions = model?.FileReferences?.Motions;
  if (!motions || typeof motions !== "object") {
    throw new Error("Tororo 模型缺少动作配置");
  }

  const availableGroups = Object.keys(motions);
  const clickGroups = availableGroups.filter((group) => group !== "Idle");
  const idleGroups = availableGroups.includes("Idle") ? ["Idle"] : clickGroups;
  if (clickGroups.length === 0 || idleGroups.length === 0) {
    throw new Error("Tororo 模型未提供可用动作组");
  }

  motionGroups = {
    click: clickGroups,
    idle: idleGroups,
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function playRandomMotion(groups) {
  if (!live2dModel) return;
  const group = randomItem(groups);
  if (!group) return;
  try {
    live2dModel.motion(group);
    setStatus("Tororo 正在播放 " + group, true);
  } catch {
    // Missing motion groups should not break the pet window.
  }
}

function scheduleIdleMotion() {
  if (idleTimer) window.clearTimeout(idleTimer);
  const delay = MIN_IDLE_DELAY_MS + Math.round(Math.random() * IDLE_DELAY_JITTER_MS);
  idleTimer = window.setTimeout(() => {
    playRandomMotion(motionGroups.idle.length > 0 ? motionGroups.idle : IDLE_MOTION_GROUPS);
    scheduleIdleMotion();
  }, delay);
}

function resizeModel(app, model) {
  const canvas = app.view;
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 430;
  app.renderer.resize(width, height);
  model.anchor.set(0.5, 0.95);
  model.position.set(width * 0.52, height * 0.96);
  const scale = Math.min(width / model.width, height / model.height) * 0.75;
  model.scale.set(Math.max(0.09, Math.min(scale, 0.9)));
}

async function installLive2dPet() {
  const canvas = document.getElementById("live2d-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  try {
    await loadLive2dRuntime();
    try {
      await loadMotionGroups();
    } catch {
      motionGroups = {
        click: CLICK_MOTION_GROUPS,
        idle: ["Idle"],
      };
    }
    const app = new window.PIXI.Application({
      view: canvas,
      autoStart: true,
      transparent: true,
      antialias: true,
      backgroundAlpha: 0,
      resizeTo: canvas.parentElement || undefined,
    });
    live2dModel = await window.PIXI.live2d.Live2DModel.from(MODEL_URL);
    live2dModel.interactive = true;
    app.stage.addChild(live2dModel);
    resizeModel(app, live2dModel);
    window.addEventListener("resize", () => resizeModel(app, live2dModel));
    live2dModel.on?.("hit", () => {
      playRandomMotion(motionGroups.click.length > 0 ? motionGroups.click : CLICK_MOTION_GROUPS);
      scheduleIdleMotion();
    });
    setStatus("Tororo 已入住小屋", true);
    scheduleIdleMotion();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Live2D 加载失败");
  }
}

function installNativeDragging() {
  const shell = document.getElementById("live2d-shell");
  if (!(shell instanceof HTMLElement)) return;
  const lockToggle = document.getElementById("lock-toggle");
  const floorDragZone = document.querySelector(".floor-drag-zone");
  if (lockToggle instanceof HTMLButtonElement) {
    lockToggle.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const locked = document.body.dataset.locked === "true";
      document.body.dataset.locked = String(!locked);
      lockToggle.textContent = locked ? "🔓" : "🔒";
      lockToggle.setAttribute("aria-label", locked ? "解锁，可拖拽" : "已锁定，单击解锁");
      lockToggle.title = locked ? "单击锁定" : "单击解锁";
    });
  }

  window.setTimeout(async () => {
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: -1, y: -1 });
    } catch {
      // ignore probe failures
    }
  }, 500);

  shell.addEventListener("pointerdown", async (event) => {
    if (event.button !== 0) return;
    if (document.body.dataset.locked === "true") return;
    if (event.target instanceof HTMLCanvasElement) return;
    if (event.target instanceof HTMLButtonElement) return;
    if (!(event.target instanceof HTMLElement && (event.target === floorDragZone || event.target.closest(".floor-drag-zone") || event.target === shell || event.target.closest("#live2d-shell")))) return;
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: event.clientX, y: event.clientY });
      await window.__TAURI__?.window?.getCurrentWindow?.().startDragging?.();
      event.preventDefault();
    } catch {
      // If the JS API is unavailable, the native drag region still applies.
    }
  });
}

installNativeDragging();
installLive2dPet();
`;
