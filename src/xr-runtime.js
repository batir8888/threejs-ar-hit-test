export const XR_SETUP_TIMEOUT_MS = 12000;
export const SURFACE_WAIT_MS = 15000;
export const XR_FRAME_WAIT_MS = 6000;

export async function withXRTimeout(operation, message, {
  timeoutMs = XR_SETUP_TIMEOUT_MS,
  onLateResult = () => {},
} = {}) {
  let expired = false;
  let timer;
  const observed = Promise.resolve(operation).then((value) => {
    if (expired) onLateResult(value);
    return value;
  });
  try {
    return await Promise.race([
      observed,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new DOMException(message, 'TimeoutError'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function cancelHitTestSource(source) {
  try { source?.cancel(); } catch { /* Сессия могла уже закрыть источник. */ }
}

export async function requestViewerHitTestSource(session, isCurrent, timeoutMs = XR_SETUP_TIMEOUT_MS) {
  const viewerSpace = await withXRTimeout(
    session.requestReferenceSpace('viewer'),
    'Не удалось подготовить поиск поверхности.',
    { timeoutMs },
  );
  if (!isCurrent()) return null;
  const source = await withXRTimeout(
    session.requestHitTestSource({ space: viewerSpace, entityTypes: ['plane'] }),
    'Поиск поверхности не отвечает. Попробуйте повторить поиск.',
    { timeoutMs, onLateResult: cancelHitTestSource },
  );
  if (!source) throw new DOMException('Браузер не создал источник поиска поверхности.', 'OperationError');
  if (!isCurrent()) {
    cancelHitTestSource(source);
    return null;
  }
  return source;
}

export function surfaceSearchState({ now, lastFrameAt, stateSince, hasTracking, hasSurface, initializing, error, visible }) {
  if (!visible) return 'paused';
  if (error) return 'error';
  if (initializing) return 'initializing';
  if (now - lastFrameAt >= XR_FRAME_WAIT_MS) return 'stalled';
  if (hasTracking && hasSurface) return 'surface';
  if (now - stateSince >= SURFACE_WAIT_MS) return hasTracking ? 'surface-timeout' : 'tracking-timeout';
  return hasTracking ? 'searching' : 'tracking';
}
