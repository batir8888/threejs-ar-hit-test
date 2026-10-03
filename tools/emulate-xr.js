// Только для локальной ручной проверки: этот модуль не входит в сборку сайта.
// В консоли на localhost: await import('/tools/emulate-xr.js')
import { XRDevice, metaQuest3 } from 'iwer';
import { SyntheticEnvironmentModule } from '@iwer/sem';

if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  throw new Error('XR-эмуляция разрешена только на localhost.');
}

const device = new XRDevice({
  ...metaQuest3,
  supportedFeatures: [...metaQuest3.supportedFeatures, 'dom-overlay'],
});
device.installRuntime({ forceInstall: true, polyfillLayers: false });
device.installSEM(SyntheticEnvironmentModule);

const floor = {
  spatialEntities: [{
    uuid: '3aa32574-0636-4f5e-8fa2-cfa1710839c2',
    semanticLabel_META: 'FLOOR',
    locatable_META: {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 1, y: 0, z: 0, w: 0 },
    },
    bounded2D_META: {
      offset: { x: -10, y: -10 },
      extent: { width: 20, height: 20 },
    },
  }],
};
device.sem.loadEnvironment(floor);
device.sem.planesVisible = true;
device.position.set(0, 1.6, 0);
device.quaternion.set(Math.sin(-Math.PI / 8), 0, 0, Math.cos(-Math.PI / 8));

// Управление позой: xrEmulator.position.set(x, y, z).
// Тап XR: xrEmulator.controllers.right.updateButtonValue('trigger', 1), затем 0.
window.xrEmulator = device;
window.xrTestFloor = floor;
// IWER выводит свой canvas в контейнере с z-index 999; DOM overlay в этом
// runtime ещё не компонуется автоматически, поэтому поднимаем локальный UI.
document.querySelector('#xr-overlay').style.zIndex = '1000';
await window.__AR_LAB__.refreshSupport();
console.info('IWER 2.5: immersive-ar / local-floor / hit-test готовы. Нажмите «Открыть AR».');

export { device, floor };
