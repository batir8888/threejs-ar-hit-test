import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODEL_INFO, createModel, createContactShadow, createPlacedModel, disposeModel } from './models.js';
import { HitTestPlacement } from './placement.js';
import { cancelHitTestSource, requestViewerHitTestSource, surfaceSearchState, withXRTimeout } from './xr-runtime.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const ui = {
  stage: $('#preview-stage'),
  start: $('#start-ar'),
  startLabel: $('#start-label'),
  supportBadge: $('#support-badge'),
  supportLabel: $('#support-label'),
  supportHint: $('#support-hint'),
  error: $('#error-message'),
  overlay: $('#xr-overlay'),
  status: $('#xr-status-text'),
  instruction: $('#xr-instruction'),
  retry: $('#retry-surface'),
  place: $('#place-object'),
  clear: $('#clear-objects'),
  count: $('#placed-count'),
};
let renderer;
let controls;
let previewModel;
let selectedModel = 'cube';
let session = null;
let hitTestSource = null;
let localFloorReferenceSpace = null;
let starting = false;
let supported = false;
let rendererReady = false;
let lastSurfaceState = '';
let lastPlacementTime = 0;
let hitTestPending = false;
let hitTestError = '';
let searchGeneration = 0;
let searchTimer = null;
let lastXRFrameAt = 0;
let searchStateSince = 0;
let searchPhase = 'tracking';

const previewScene = new THREE.Scene();
const arScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(36, 1, 0.01, 20);
const arCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 30);
const placement = new HitTestPlacement(arScene, createPlacedModel, disposeModel);

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xf2ffdf, 0x34452d, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 3.5);
  key.position.set(2, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd3eea9, 1.1);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
}
addLights(previewScene);
addLights(arScene);

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    ui.stage.appendChild(renderer.domElement);
    controls = new OrbitControls(previewCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.autoRotate = false;

    const grid = new THREE.GridHelper(4, 40, 0x9ab88a, 0x799a6e);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.material.depthWrite = false;
    grid.position.y = -0.002;
    previewScene.add(grid);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.29, 0.293, 100).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xc5f873, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    ring.position.y = 0.001;
    previewScene.add(ring);
    setModel('cube');

    // WebXR select работает с тапом на телефоне и контроллером эмулятора.
    for (let index = 0; index < 2; index++) {
      const controller = renderer.xr.getController(index);
      controller.addEventListener('select', placeObject);
      arScene.add(controller);
    }
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      rendererReady = false;
      void session?.end().catch(() => {});
      ui.start.disabled = true;
      showError('Графический контекст потерян. Обновите страницу, чтобы снова открыть 3D и AR.');
    });
    new ResizeObserver(resizeRenderer).observe(ui.stage);
    window.addEventListener('resize', resizeRenderer);
    rendererReady = true;
    resizeRenderer();
    renderer.setAnimationLoop(animate);
  } catch (error) {
    const previewError = $('#preview-error');
    previewError.hidden = false;
    previewError.textContent = 'Не удалось запустить 3D. Включите аппаратное ускорение в браузере и обновите страницу.';
    showError('Для приложения нужен доступный WebGL.');
    console.error(error);
  }
}

function resizeRenderer() {
  if (!renderer || renderer.xr.isPresenting) return;
  const active = Boolean(session);
  const width = active ? window.innerWidth : ui.stage.clientWidth;
  const height = active ? window.innerHeight : ui.stage.clientHeight;
  if (width === 0 || height === 0) return;
  renderer.setSize(width, height, false);
  const previousFit = Math.max(1, 0.95 / previewCamera.aspect);
  previewCamera.aspect = width / height;
  const currentFit = Math.max(1, 0.95 / previewCamera.aspect);
  // В портретном окне объект должен целиком помещаться по ширине.
  previewCamera.position.sub(controls.target).multiplyScalar(currentFit / previousFit).add(controls.target);
  previewCamera.updateProjectionMatrix();
}

function setModel(kind) {
  if (!MODEL_INFO[kind]) return;
  selectedModel = kind;
  const info = MODEL_INFO[kind];
  for (const button of document.querySelectorAll('[data-model]')) {
    const selected = button.dataset.model === kind;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('#object-name').textContent = info.name;
  $('#preview-size').textContent = info.size;
  ui.stage.setAttribute('aria-label', `Интерактивный 3D-просмотр: ${info.name}`);
  if (!renderer) return;
  if (previewModel) disposeModel(previewModel);
  previewModel = createModel(kind);
  previewModel.add(createContactShadow(kind === 'cube' ? 0.3 : 0.5));
  previewScene.add(previewModel);
  const distance = (kind === 'cube' ? 1.15 : 1.75) * Math.max(1, 0.95 / previewCamera.aspect);
  previewCamera.position.set(distance * 0.65, info.center + distance * 0.45, distance * 0.8);
  controls.target.set(0, info.center, 0);
  controls.update();
}

async function checkSupport() {
  supported = false;
  if (!window.isSecureContext) {
    ui.supportLabel.textContent = 'Для AR нужен HTTPS';
    ui.supportHint.textContent = 'Откройте опубликованную HTTPS-страницу. Локально используйте localhost.';
  } else if (!navigator.xr) {
    ui.supportLabel.textContent = '3D-просмотр · AR недоступен';
    ui.supportHint.textContent = 'Для AR откройте приложение на совместимом Android или в WebXR-эмуляторе.';
  } else {
    try {
      supported = await navigator.xr.isSessionSupported('immersive-ar');
      ui.supportLabel.textContent = supported ? 'AR готов' : '3D-просмотр · AR недоступен';
      ui.supportHint.textContent = supported ? 'Для начала держите телефон в 0,5–1,5 м от пола или стола. Если вблизи изображение размыто, отодвиньте телефон.' : 'Для AR откройте приложение на совместимом Android или в WebXR-эмуляторе.';
    } catch {
      ui.supportLabel.textContent = 'Не удалось проверить поддержку AR';
      ui.supportHint.textContent = 'Проверьте разрешения браузера и откройте страницу через HTTPS.';
    }
  }
  ui.supportBadge.dataset.state = supported ? 'supported' : 'unsupported';
  ui.start.disabled = !supported || !rendererReady || starting;
  ui.startLabel.textContent = supported ? 'Открыть AR' : 'AR недоступен';
}

function showError(message) {
  ui.error.hidden = false;
  ui.error.textContent = message;
}

function explainSessionError(error) {
  if (error.name === 'TimeoutError') return error.message;
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Запуск AR не разрешён. Разрешите доступ к камере и AR в настройках браузера, затем попробуйте снова.';
  if (error.name === 'NotSupportedError') return 'Устройство должно поддерживать AR, поиск поверхности (hit-test) и пространство local-floor. Попробуйте совместимый Android или настройте WebXR-эмулятор.';
  if (error.name === 'InvalidStateError') return 'AR-сессия уже открыта или была прервана. Закройте её и повторите запуск.';
  return 'Не удалось открыть AR-сессию. Проверьте доступ к камере и попробуйте снова.';
}

async function startAR() {
  if (!supported || !rendererReady || session || starting) return;
  starting = true;
  ui.start.disabled = true;
  ui.startLabel.textContent = 'Запускаем…';
  ui.error.hidden = true;
  let requestedSession;
  try {
    // Вызывается прямо из пользовательского клика: необходима user activation.
    requestedSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: ui.overlay },
    });
    session = requestedSession;
    placement.reset();
    lastSurfaceState = '';
    resetSurfaceSearch();
    requestedSession.addEventListener('end', () => endSession(requestedSession), { once: true });
    requestedSession.addEventListener('visibilitychange', () => {
      if (session !== requestedSession) return;
      if (requestedSession.visibilityState !== 'visible') {
        placement.hideReticle();
        placement.hasTracking = false;
        placement.objects.visible = false;
        updateARStatus();
      } else {
        // После разрешений, сворачивания или системного меню даём трекингу время.
        lastXRFrameAt = searchStateSince = performance.now();
        updateARStatus();
      }
    });
    controls.enabled = false;
    renderer.domElement.classList.add('xr-canvas');
    document.body.appendChild(renderer.domElement);
    document.body.classList.add('in-ar');
    ui.overlay.hidden = false;
    updateCounts();
    updateARStatus();
    resizeRenderer();
    await withXRTimeout(renderer.xr.setSession(requestedSession), 'AR не смог начать показ камеры. Закройте другие приложения камеры и повторите запуск.');
    if (session !== requestedSession) return;
    // Three.js уже запросил local-floor. Используем ровно это пространство.
    localFloorReferenceSpace = renderer.xr.getReferenceSpace();
    lastXRFrameAt = searchStateSince = performance.now();
    // Поиск запускается в animate только после первого кадра с позой камеры.
    // Сначала подключаем render layer и дожидаемся трекинга, затем ищем плоскости.
    searchTimer = setInterval(updateARStatus, 500);
    updateARStatus();
  } catch (error) {
    if (requestedSession && session === requestedSession) {
      try { await requestedSession.end(); } catch { endSession(requestedSession); }
    }
    showError(explainSessionError(error));
    console.warn('AR initialization:', error.name, error.message);
  } finally {
    starting = false;
    ui.start.disabled = !supported || !rendererReady;
    ui.startLabel.textContent = 'Открыть AR';
  }
}

function resetSurfaceSearch() {
  searchGeneration++;
  cancelHitTestSource(hitTestSource);
  hitTestSource = null;
  hitTestPending = false;
  hitTestError = '';
  placement.hideReticle();
  lastXRFrameAt = searchStateSince = performance.now();
  searchPhase = 'tracking';
  lastSurfaceState = '';
}

async function beginSurfaceSearch() {
  if (!session || !localFloorReferenceSpace || !placement.hasTracking || hitTestPending || hitTestSource || hitTestError) return;
  const activeSession = session;
  const generation = searchGeneration;
  const isCurrent = () => session === activeSession && generation === searchGeneration;
  hitTestPending = true;
  updateARStatus();
  try {
    const source = await requestViewerHitTestSource(activeSession, isCurrent);
    if (!isCurrent()) return;
    hitTestSource = source;
    searchStateSince = performance.now();
  } catch (error) {
    if (!isCurrent()) return;
    hitTestError = error.name === 'TimeoutError' ? error.message : 'Не удалось начать поиск поверхности. Повторите поиск или заново откройте AR.';
    console.warn('AR hit-test:', error.name, error.message);
  } finally {
    if (isCurrent()) {
      hitTestPending = false;
      updateARStatus();
    }
  }
}

function endSession(endedSession) {
  if (session !== endedSession) return;
  clearInterval(searchTimer);
  searchTimer = null;
  resetSurfaceSearch();
  localFloorReferenceSpace = null;
  session = null;
  placement.reset();
  ui.overlay.hidden = true;
  document.body.classList.remove('in-ar');
  renderer.domElement.classList.remove('xr-canvas');
  ui.stage.appendChild(renderer.domElement);
  controls.enabled = true;
  updateCounts();
  resizeRenderer();
  ui.start.disabled = !supported || !rendererReady;
  ui.start.focus({ preventScroll: true });
}

function updateCounts() {
  ui.count.textContent = String(placement.count);
  ui.clear.disabled = placement.count === 0;
}

function updateARStatus() {
  if (!session) return;
  const state = surfaceSearchState({
    now: performance.now(), lastFrameAt: lastXRFrameAt, stateSince: searchStateSince,
    hasTracking: placement.hasTracking, hasSurface: placement.hasSurface,
    initializing: !localFloorReferenceSpace || hitTestPending,
    error: hitTestError, visible: session.visibilityState === 'visible',
  });
  ui.place.disabled = state !== 'surface';
  ui.retry.hidden = !['error', 'surface-timeout', 'tracking-timeout', 'stalled'].includes(state);
  ui.retry.disabled = hitTestPending || starting;
  ui.retry.dataset.restart = String(state === 'tracking-timeout' || state === 'stalled');
  ui.retry.textContent = ui.retry.dataset.restart === 'true' ? 'Выйти и повторить запуск' : 'Повторить поиск';
  if (state === lastSurfaceState) return;
  lastSurfaceState = state;
  $('.xr-status').dataset.ready = String(state === 'surface');
  if (state === 'surface') {
    ui.status.textContent = 'Поверхность найдена';
    ui.instruction.textContent = 'Коснитесь экрана, чтобы разместить объект.';
  } else if (state === 'searching') {
    ui.status.textContent = 'Ищем поверхность…';
    ui.instruction.textContent = 'Наклоните телефон вниз и медленно двигайте его. Держите расстояние 0,5–1,5 м до пола или стола; изображение должно быть чётким.';
  } else if (state === 'tracking') {
    ui.status.textContent = 'Ожидаем трекинг…';
    ui.instruction.textContent = 'Медленно перемещайте телефон над хорошо освещённым полом или столом с видимым рисунком.';
  } else if (state === 'surface-timeout') {
    ui.status.textContent = 'Поверхность пока не найдена';
    ui.instruction.textContent = 'Если вблизи всё размыто, отодвиньте телефон. Наведите центр экрана на хорошо освещённый ковёр или стол с рисунком и медленно двигайте телефон.';
  } else if (state === 'tracking-timeout' || state === 'stalled') {
    ui.status.textContent = state === 'stalled' ? 'Камера AR не отвечает' : 'Не удалось начать трекинг';
    ui.instruction.textContent = 'Повторите запуск AR. Если проблема остаётся, обновите Chrome и «Сервисы Google Play для AR», затем перезапустите Chrome.';
  } else if (state === 'error') {
    ui.status.textContent = 'Поиск поверхности не запустился';
    ui.instruction.textContent = hitTestError;
  } else if (state === 'paused') {
    ui.status.textContent = 'AR на паузе';
    ui.instruction.textContent = 'Вернитесь к приложению, чтобы продолжить поиск поверхности.';
  } else {
    ui.status.textContent = 'Подготавливаем AR…';
    ui.instruction.textContent = 'Разрешите доступ к камере и направьте её на пол или стол.';
  }
}

function placeObject() {
  if (!session || session.visibilityState !== 'visible') return;
  if (lastSurfaceState !== 'surface') return;
  // Дополнительная защита от двойного события DOM + select.
  const now = performance.now();
  if (now - lastPlacementTime < 250) return;
  const object = placement.place(selectedModel);
  if (!object) return;
  lastPlacementTime = now;
  updateCounts();
}

function animate(timestamp, frame) {
  if (frame && session) {
    lastXRFrameAt = performance.now();
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (referenceSpace && session.visibilityState === 'visible') {
      try {
        placement.update(frame, hitTestSource, referenceSpace);
        const phase = !placement.hasTracking ? 'tracking' : placement.hasSurface ? 'surface' : 'searching';
        if (phase !== searchPhase) {
          searchPhase = phase;
          searchStateSince = performance.now();
        }
        void beginSurfaceSearch();
      } catch (error) {
        cancelHitTestSource(hitTestSource);
        hitTestSource = null;
        placement.hideReticle();
        hitTestError = 'Поиск поверхности прервался. Нажмите «Повторить поиск».';
        console.warn('AR frame:', error.name, error.message);
      }
    } else {
      placement.hideReticle();
      placement.hasTracking = false;
      placement.objects.visible = false;
    }
    updateARStatus();
    renderer.render(arScene, arCamera);
  } else {
    if (document.hidden) return;
    controls?.update();
    renderer.render(previewScene, previewCamera);
  }
}

ui.start.addEventListener('click', startAR);
ui.retry.addEventListener('click', async () => {
  if (!session || starting) return;
  if (ui.retry.dataset.restart === 'true') {
    try { await session.end(); } catch { showError('Не удалось закрыть AR. Используйте системную кнопку выхода.'); }
  } else {
    resetSurfaceSearch();
    updateARStatus();
  }
});
ui.place.addEventListener('click', placeObject);
ui.clear.addEventListener('click', () => { placement.clear(); updateCounts(); });
$('#end-ar').addEventListener('click', async () => {
  try { await session?.end(); } catch { showError('Не удалось закрыть AR. Используйте системную кнопку выхода.'); }
});
for (const button of document.querySelectorAll('[data-model]')) {
  button.addEventListener('click', () => setModel(button.dataset.model));
}
// Нажатие UI не должно одновременно размещать объект через WebXR select.
ui.overlay.addEventListener('beforexrselect', (event) => {
  if (event.target.closest('button, .xr-control')) event.preventDefault();
});
initRenderer();
void checkSupport();

// Диагностика для локальной проверки в эмуляторе. Vite удаляет её из production.
if (import.meta.env.DEV) {
  window.__AR_LAB__ = {
    refreshSupport: checkSupport,
    snapshot: () => ({
      active: Boolean(session),
      referenceSpace: localFloorReferenceSpace && renderer.xr.getReferenceSpace() === localFloorReferenceSpace ? 'local-floor' : null,
      hasSurface: placement.hasSurface,
      hasTracking: placement.hasTracking,
      searchState: lastSurfaceState,
      hitTestPending,
      hasHitTestSource: Boolean(hitTestSource),
      count: placement.count,
      reticle: placement.reticle.matrix.toArray(),
      objects: placement.objects.children.map((object) => ({ kind: object.userData.kind, matrix: object.matrix.toArray(), world: object.matrixWorld.toArray() })),
      camera: arCamera.matrixWorld.toArray(),
    }),
  };
}
