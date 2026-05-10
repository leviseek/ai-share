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
const FLOOR_STYLES = [
  { id: "warm-wood", label: "暖木地板" },
  { id: "light-wood", label: "浅木地板" },
  { id: "tatami", label: "榻榻米" },
  { id: "marble", label: "大理石" },
  { id: "night-floor", label: "星夜地板" },
  { id: "grass", label: "草地" },
  { id: "tile", label: "蓝白瓷砖" },
  { id: "pastel", label: "糖果云朵" },
  { id: "cloud", label: "云朵地板" },
];
const PARTICLE_EFFECTS = [
  { id: "none", label: "关闭" },
  { id: "sakura", label: "樱花" },
  { id: "fireworks", label: "烟火" },
  { id: "snow", label: "雪花" },
  { id: "stars", label: "星光" },
  { id: "bubbles", label: "泡泡" },
];
const SIZE_OPTIONS = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
];

let live2dModel;
let idleTimer;
let particleAnimation;
let particleItems = [];
let motionGroups = { click: [], idle: [] };
let hitRegionPollTimer;
let petSettings = {
  floorStyle: "warm-wood",
  particleEffect: "bubbles",
  opacity: 96,
  size: "medium",
};

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
  playMotion(group);
}

function playMotion(group) {
  if (!live2dModel) return;
  if (!group) return;
  try {
    live2dModel.motion(group);
    setStatus("Tororo 正在播放 " + group, true);
  } catch {
    // Missing motion groups should not break the pet window.
  }
}

function availableMotionGroups() {
  const groups = [...motionGroups.idle, ...motionGroups.click, ...IDLE_MOTION_GROUPS];
  return [...new Set(groups.filter(Boolean))];
}

function applyPetSettings(options = {}) {
  const { preserveMenu = false } = options;
  document.body.dataset.floorStyle = petSettings.floorStyle;
  document.body.dataset.size = petSettings.size;
  document.body.style.setProperty("--pet-opacity", String(petSettings.opacity / 100));
  const menu = document.getElementById("live2d-context-menu");
  if (!menu?.hidden && !preserveMenu) {
    renderContextMenu();
  } else if (!menu?.hidden) {
    syncOpacityDisplay();
  }
  startParticleEffect(petSettings.particleEffect);
  syncHitRegions();
}

function installContextMenu() {
  const shell = document.getElementById("live2d-shell");
  const menu = document.getElementById("live2d-context-menu");
  if (!(shell instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;

  shell.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    const nativeSelection = await showNativeContextMenu(event.clientX, event.clientY);
    if (nativeSelection !== undefined) {
      applyMenuSelection(nativeSelection);
      return;
    }
    renderContextMenu();
    menu.hidden = false;
    positionContextMenu(menu, event.clientX, event.clientY);
  });

  document.addEventListener("pointerdown", (event) => {
    if (menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    menu.hidden = true;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.hidden = true;
    }
  });

  window.addEventListener("resize", () => {
    if (!menu.hidden) positionContextMenu(menu, menu.offsetLeft, menu.offsetTop);
  });
}

async function showNativeContextMenu(x, y) {
  try {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return undefined;
    const selection = await invoke("show_context_menu", { x, y, motions: availableMotionGroups() });
    return typeof selection === "string" ? selection : null;
  } catch {
    return undefined;
  }
}

function updateHitRegions(regions) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;
  invoke("update_hit_regions", { regions, scaleFactor: window.devicePixelRatio || 1 }).catch(() => {
    // ignore sync failures; native fallback still works
  });
}

function syncHitRegions() {
  const regions = [];
  const canvas = document.getElementById("live2d-canvas");
  if (canvas instanceof HTMLCanvasElement && live2dModel) {
    const canvasRect = canvas.getBoundingClientRect();
    try {
      const bounds = live2dModel.getBounds?.();
      if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
        regions.push({
          left: canvasRect.left + bounds.x,
          top: canvasRect.top + bounds.y,
          right: canvasRect.left + bounds.x + bounds.width,
          bottom: canvasRect.top + bounds.y + bounds.height,
        });
      }
    } catch {
      // ignore model bounds failures
    }
  }
  for (const element of [
    document.querySelector(".floor"),
    document.getElementById("lock-toggle"),
    document.querySelector(".top-drag-zone"),
    document.querySelector(".floor-drag-zone"),
  ]) {
    if (!(element instanceof HTMLElement)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    regions.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  updateHitRegions(regions);
}

function applyMenuSelection(selection) {
  if (!selection) return;
  const [action, value] = selection.split(":");
  if (action === "motion") {
    playMotion(value);
    scheduleIdleMotion();
  } else if (action === "floor") {
    petSettings.floorStyle = value || petSettings.floorStyle;
    applyPetSettings();
  } else if (action === "particle") {
    petSettings.particleEffect = value || petSettings.particleEffect;
    applyPetSettings();
  } else if (action === "opacity") {
    petSettings.opacity = Number.parseInt(value, 10);
    applyPetSettings({ preserveMenu: true });
  } else if (action === "size") {
    petSettings.size = value || petSettings.size;
    applyPetSettings();
  }
}

function positionContextMenu(menu, x, y) {
  const margin = 8;
  const gap = 10;
  const width = menu.offsetWidth || 168;
  const height = menu.offsetHeight || 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const desiredLeft = x > viewportWidth / 2 ? x - width - gap : x + gap;
  const desiredTop = y > viewportHeight / 2 ? y - height - gap : y + gap;
  const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - width - margin));
  const top = Math.max(margin, Math.min(desiredTop, viewportHeight - height - margin));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function renderContextMenu() {
  const menu = document.getElementById("live2d-context-menu");
  if (!(menu instanceof HTMLElement)) return;
  const openSections = new Set(
    Array.from(menu.querySelectorAll("details"))
      .filter((section) => section.open)
      .map((section) => section.dataset.menuSection)
      .filter(Boolean),
  );
  const motions = availableMotionGroups();
  const motionButtons = motions
    .map((group) => '<button class="menu-button" type="button" data-menu-action="motion" data-motion-group="' + escapeHtml(group) + '">' + escapeHtml(group) + "</button>")
    .join("");
  const floorButtons = FLOOR_STYLES
    .map((style) => menuOptionButton("floor", style.id, style.label, petSettings.floorStyle === style.id))
    .join("");
  const particleButtons = PARTICLE_EFFECTS
    .map((effect) => menuOptionButton("particle", effect.id, effect.label, petSettings.particleEffect === effect.id))
    .join("");
  const sizeButtons = SIZE_OPTIONS
    .map((size) => menuOptionButton("size", size.id, size.label, petSettings.size === size.id))
    .join("");
  menu.innerHTML =
    '<p class="menu-title">Live2D Pet 设置</p>' +
    detailsMarkup("motions", "动作列表", true, '<div class="menu-grid">' +
    (motionButtons || '<button class="menu-button menu-button--full" type="button" disabled>动作加载中</button>') +
    "</div>", openSections) +
    detailsMarkup("floor", "地板样式", false, '<div class="menu-grid">' +
    floorButtons +
    "</div>", openSections) +
    detailsMarkup("particle", "粒子背景", false, '<div class="menu-grid">' +
    particleButtons +
    "</div>", openSections) +
    detailsMarkup("opacity", "透明度", false, '<label class="menu-label-row"><span>当前透明度</span><span class="menu-value">' +
    petSettings.opacity +
    '%</span></label><input class="menu-slider" type="range" min="35" max="100" step="5" value="' +
    petSettings.opacity +
    '" data-menu-action="opacity" />', openSections) +
    detailsMarkup("size", "尺寸", false, '<div class="menu-row">' +
    sizeButtons +
    "</div>", openSections);
  menu.querySelectorAll('button[data-menu-action]').forEach((control) => {
    control.addEventListener("click", handleMenuAction);
  });
  menu.querySelectorAll('input[data-menu-action]').forEach((control) => {
    control.addEventListener("input", handleMenuAction);
  });
}

function syncOpacityDisplay() {
  const menu = document.getElementById("live2d-context-menu");
  if (!(menu instanceof HTMLElement)) return;
  const opacityInput = menu.querySelector('input[data-menu-action="opacity"]');
  if (opacityInput instanceof HTMLInputElement) {
    opacityInput.value = String(petSettings.opacity);
  }
  const opacityValue = menu.querySelector(".menu-section[data-menu-section='opacity'] .menu-value");
  if (opacityValue instanceof HTMLElement) {
    opacityValue.textContent = petSettings.opacity + "%";
  }
}

function detailsMarkup(section, title, defaultOpen, content, openSections) {
  const open = openSections.size === 0 ? defaultOpen : openSections.has(section);
  return '<details class="menu-section" data-menu-section="' + section + '"' + (open ? " open" : "") + "><summary>" + title + "</summary>" + content + "</details>";
}

function menuOptionButton(group, value, label, active) {
  return (
    '<button class="menu-chip" type="button" data-menu-action="' +
    group +
    '" data-menu-value="' +
    escapeHtml(value) +
    '" data-active="' +
    String(active) +
    '">' +
    escapeHtml(label) +
    "</button>"
  );
}

function handleMenuAction(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.menuAction;
  if (action === "motion") {
    playMotion(target.dataset.motionGroup);
    scheduleIdleMotion();
    return;
  }
  if (action === "floor") {
    petSettings.floorStyle = target.dataset.menuValue || petSettings.floorStyle;
  } else if (action === "particle") {
    petSettings.particleEffect = target.dataset.menuValue || petSettings.particleEffect;
  } else if (action === "size") {
    petSettings.size = target.dataset.menuValue || petSettings.size;
  } else if (action === "opacity" && target instanceof HTMLInputElement) {
    petSettings.opacity = Number.parseInt(target.value, 10);
  }
  applyPetSettings({ preserveMenu: action === "opacity" });
}

function startParticleEffect(effect) {
  const canvas = document.getElementById("live2d-particles");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  if (particleAnimation) window.cancelAnimationFrame(particleAnimation);
  particleAnimation = undefined;
  particleItems = [];
  const context = canvas.getContext("2d");
  if (!context) return;
  resizeParticleCanvas(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (effect === "none") return;
  particleItems = createParticles(effect, canvas.width, canvas.height);
  const draw = () => {
    resizeParticleCanvas(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    updateParticles(context, effect, canvas.width, canvas.height);
    particleAnimation = window.requestAnimationFrame(draw);
  };
  particleAnimation = window.requestAnimationFrame(draw);
}

function resizeParticleCanvas(canvas) {
  const width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function createParticles(effect, width, height) {
  const count = effect === "fireworks" ? 26 : effect === "stars" ? 34 : 22;
  return Array.from({ length: count }, () => makeParticle(effect, width, height, true));
}

function makeParticle(effect, width, height, initial) {
  const size = effect === "fireworks" ? randomBetween(1.5, 3.6) : randomBetween(2, 7);
  return {
    x: randomBetween(0, width),
    y: initial ? randomBetween(0, height) : -size,
    vx: effect === "sakura" ? randomBetween(-0.35, 0.45) : randomBetween(-0.15, 0.15),
    vy: particleSpeed(effect),
    size,
    alpha: randomBetween(0.38, 0.9),
    hue: randomBetween(0, 360),
    pulse: randomBetween(0, Math.PI * 2),
  };
}

function particleSpeed(effect) {
  if (effect === "fireworks") return randomBetween(-1.8, 1.2);
  if (effect === "snow") return randomBetween(0.35, 0.85);
  if (effect === "bubbles") return randomBetween(-0.9, -0.35);
  return randomBetween(0.45, 1.2);
}

function updateParticles(context, effect, width, height) {
  for (let index = 0; index < particleItems.length; index += 1) {
    const item = particleItems[index];
    item.pulse += 0.03;
    item.x += item.vx + Math.sin(item.pulse) * 0.25;
    item.y += item.vy;
    drawParticle(context, effect, item);
    const outBottom = item.y > height + item.size * 2;
    const outTop = item.y < -item.size * 4;
    const outSide = item.x < -item.size * 4 || item.x > width + item.size * 4;
    if (outBottom || outTop || outSide) {
      particleItems[index] = makeParticle(effect, width, height, false);
      if (effect === "bubbles") particleItems[index].y = height + particleItems[index].size;
      if (effect === "fireworks") particleItems[index].y = randomBetween(height * 0.2, height * 0.8);
    }
  }
}

function drawParticle(context, effect, item) {
  context.save();
  context.globalAlpha = item.alpha;
  if (effect === "sakura") {
    context.translate(item.x, item.y);
    context.rotate(Math.sin(item.pulse) * 0.8);
    context.fillStyle = "#ffb7c9";
    context.beginPath();
    context.ellipse(0, 0, item.size * 0.8, item.size * 1.35, 0, 0, Math.PI * 2);
    context.fill();
  } else if (effect === "fireworks") {
    context.strokeStyle = "hsl(" + item.hue + " 90% 62%)";
    context.lineWidth = Math.max(1, item.size * 0.35);
    for (let ray = 0; ray < 6; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 6 + item.pulse;
      context.beginPath();
      context.moveTo(item.x, item.y);
      context.lineTo(item.x + Math.cos(angle) * item.size * 3, item.y + Math.sin(angle) * item.size * 3);
      context.stroke();
    }
  } else if (effect === "stars") {
    context.fillStyle = "#ffe78f";
    context.beginPath();
    context.arc(item.x, item.y, item.size * (0.45 + Math.sin(item.pulse) * 0.18), 0, Math.PI * 2);
    context.fill();
  } else if (effect === "bubbles") {
    context.strokeStyle = "rgba(166, 224, 255, 0.86)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(item.x, item.y, item.size, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(item.x, item.y, item.size * 0.55, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
  syncHitRegions();
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
    window.addEventListener("resize", () => startParticleEffect(petSettings.particleEffect));
    live2dModel.on?.("hit", () => {
      playRandomMotion(motionGroups.click.length > 0 ? motionGroups.click : CLICK_MOTION_GROUPS);
      scheduleIdleMotion();
    });
    setStatus("Tororo 已入住小屋", true);
    scheduleIdleMotion();
    syncHitRegions();
    if (hitRegionPollTimer) window.clearInterval(hitRegionPollTimer);
    hitRegionPollTimer = window.setInterval(syncHitRegions, 800);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Live2D 加载失败");
  }
}

function installNativeDragging() {
  const shell = document.getElementById("live2d-shell");
  if (!(shell instanceof HTMLElement)) return;
  const lockToggle = document.getElementById("lock-toggle");
  const floorDragZone = document.querySelector(".floor-drag-zone");
  const topDragZone = document.querySelector(".top-drag-zone");
  if (lockToggle instanceof HTMLButtonElement) {
    lockToggle.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const locked = document.body.dataset.locked === "true";
      document.body.dataset.locked = String(!locked);
      const lockIcon = lockToggle.querySelector(".lock-icon");
      if (lockIcon instanceof HTMLElement) {
        lockIcon.textContent = locked ? "🔓" : "🔒";
      }
      lockToggle.setAttribute("aria-label", locked ? "已解锁，可拖拽" : "已锁定拖拽");
      lockToggle.title = locked ? "单击锁定拖拽" : "单击解锁拖拽";
      syncHitRegions();
    });
  }

  window.setTimeout(async () => {
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: -1, y: -1 });
    } catch {
      // ignore probe failures
    }
  }, 500);

  window.addEventListener("resize", () => syncHitRegions());

  shell.addEventListener("pointerdown", async (event) => {
    if (event.button !== 0) return;
    if (document.body.dataset.locked === "true") return;
    if (event.target instanceof HTMLCanvasElement) return;
    if (event.target instanceof HTMLButtonElement) return;
    if (event.target instanceof HTMLElement && event.target.closest("#live2d-context-menu")) return;
    if (!(event.target instanceof HTMLElement && (event.target === floorDragZone || event.target.closest(".floor-drag-zone") || event.target === topDragZone || event.target.closest(".top-drag-zone") || event.target === shell || event.target.closest("#live2d-shell")))) return;
    try {
      await window.__TAURI__?.core?.invoke?.("click_probe", { x: event.clientX, y: event.clientY });
      await window.__TAURI__?.window?.getCurrentWindow?.().startDragging?.();
      event.preventDefault();
    } catch {
      // If the JS API is unavailable, the native drag region still applies.
    }
  });
}

installContextMenu();
applyPetSettings();
installNativeDragging();
installLive2dPet();
`;
