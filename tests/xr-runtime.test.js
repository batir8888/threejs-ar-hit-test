import test from 'node:test';
import assert from 'node:assert/strict';
import { requestViewerHitTestSource, surfaceSearchState, SURFACE_WAIT_MS, XR_FRAME_WAIT_MS } from '../src/xr-runtime.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

test('поиск запрашивает реальные плоскости из пространства viewer', async () => {
  const viewer = {};
  const source = { cancel() {} };
  const session = {
    async requestReferenceSpace(type) { assert.equal(type, 'viewer'); return viewer; },
    async requestHitTestSource(options) {
      assert.equal(options.space, viewer);
      assert.deepEqual(options.entityTypes, ['plane']);
      return source;
    },
  };
  assert.equal(await requestViewerHitTestSource(session, () => true), source);
});

test('зависший запрос viewer завершается таймаутом и не запрашивает источник', async () => {
  const session = {
    requestReferenceSpace: () => new Promise(() => {}),
    requestHitTestSource: () => assert.fail('Источнику нужно пространство viewer'),
  };
  await assert.rejects(requestViewerHitTestSource(session, () => true, 5), { name: 'TimeoutError' });
});

test('запоздавший источник после таймаута отменяется', async () => {
  const pending = deferred();
  let cancelled = 0;
  const session = {
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: () => pending.promise,
  };
  await assert.rejects(requestViewerHitTestSource(session, () => true, 5), { name: 'TimeoutError' });
  pending.resolve({ cancel() { cancelled++; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, 1);
});

test('выход во время запроса viewer не создаёт источник в закрытой сессии', async () => {
  const pending = deferred();
  let active = true;
  const request = requestViewerHitTestSource({
    requestReferenceSpace: () => pending.promise,
    requestHitTestSource: () => assert.fail('Сессия уже завершена'),
  }, () => active);
  active = false;
  pending.resolve({});
  assert.equal(await request, null);
});

test('повторный запуск отменяет источник, полученный для старого поиска', async () => {
  const pending = deferred();
  let current = true;
  let cancelled = 0;
  const request = requestViewerHitTestSource({
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: () => pending.promise,
  }, () => current);
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  pending.resolve({ cancel() { cancelled++; } });
  assert.equal(await request, null);
  assert.equal(cancelled, 1);
});

test('отказ и null-источник не считаются готовым поиском; повторная попытка работает', async () => {
  const source = { cancel() {} };
  let attempts = 0;
  const session = {
    requestReferenceSpace: async () => ({}),
    async requestHitTestSource() {
      attempts++;
      if (attempts === 1) throw new DOMException('ARCore не готов', 'OperationError');
      if (attempts === 2) return null;
      return source;
    },
  };
  await assert.rejects(requestViewerHitTestSource(session, () => true), { name: 'OperationError' });
  await assert.rejects(requestViewerHitTestSource(session, () => true), { name: 'OperationError' });
  assert.equal(await requestViewerHitTestSource(session, () => true), source);
});

const search = (overrides = {}) => ({
  now: 1000, lastFrameAt: 1000, stateSince: 0,
  hasTracking: true, hasSurface: false, initializing: false, error: '', visible: true,
  ...overrides,
});

test('длительное отсутствие плоскости и отсутствие трекинга дают разные подсказки', () => {
  assert.equal(surfaceSearchState(search()), 'searching');
  assert.equal(surfaceSearchState(search({ hasTracking: false })), 'tracking');
  const timed = { now: SURFACE_WAIT_MS, lastFrameAt: SURFACE_WAIT_MS };
  assert.equal(surfaceSearchState(search(timed)), 'surface-timeout');
  assert.equal(surfaceSearchState(search({ ...timed, hasTracking: false })), 'tracking-timeout');
  assert.equal(surfaceSearchState(search({ ...timed, hasSurface: true })), 'surface');
});

test('при остановке XR-кадров прежняя поверхность перестаёт разрешать размещение', () => {
  assert.equal(surfaceSearchState(search({ now: 1000 + XR_FRAME_WAIT_MS, hasSurface: true })), 'stalled');
  assert.equal(surfaceSearchState(search({ hasSurface: true })), 'surface');
});

test('пауза, подготовка и ошибка отображаются отдельно от поиска плоскости', () => {
  assert.equal(surfaceSearchState(search({ visible: false, now: 60000 })), 'paused');
  assert.equal(surfaceSearchState(search({ initializing: true })), 'initializing');
  assert.equal(surfaceSearchState(search({ error: 'Поиск не отвечает' })), 'error');
});
