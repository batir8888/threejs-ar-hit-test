import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const MODEL_INFO = {
  cube: { name: 'Куб', size: '30 × 30 × 30 см', center: 0.15 },
  chair: { name: 'Кресло', size: '56 × 64 × 52 см', center: 0.29 },
  sphere: { name: 'Сфера', size: 'Диаметр 30 см', center: 0.15 },
};

function roundedPart(parent, size, position, material, radius = 0.018) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, radius), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

export function createModel(kind) {
  const model = new THREE.Group();
  model.name = MODEL_INFO[kind].name;
  const green = new THREE.MeshStandardMaterial({ color: 0xb9e67d, roughness: 0.43, metalness: 0.06 });
  green.userData.editable = true;

  // Нулевая высота модели совпадает с опорной плоскостью; единицы — метры.
  if (kind === 'cube') {
    roundedPart(model, [0.3, 0.3, 0.3], [0, 0.15, 0], green, 0.012);
  } else if (kind === 'sphere') {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 48, 32), green);
    sphere.position.y = 0.15;
    model.add(sphere);
  } else {
    green.roughness = 0.95;
    roundedPart(model, [0.46, 0.12, 0.46], [0, 0.3, 0], green, 0.025);
    roundedPart(model, [0.46, 0.35, 0.09], [0, 0.46, -0.195], green, 0.025);
    roundedPart(model, [0.09, 0.11, 0.52], [-0.235, 0.37, 0], green, 0.023);
    roundedPart(model, [0.09, 0.11, 0.52], [0.235, 0.37, 0], green, 0.023);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7c5535, roughness: 0.75 });
    for (const x of [-0.19, 0.19]) {
      for (const z of [-0.17, 0.17]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.24, 12), wood);
        leg.position.set(x, 0.12, z);
        model.add(leg);
      }
    }
  }
  model.userData.kind = kind;
  return model;
}

export function createContactShadow(size = 0.3) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.14)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.4, size * 2.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  return shadow;
}

export function createPlacedModel(kind) {
  const root = createModel(kind);
  root.add(createContactShadow(kind === 'cube' ? 0.3 : 0.5));
  return root;
}

export function disposeModel(model) {
  const materials = new Set();
  model.traverse((child) => {
    child.geometry?.dispose();
    if (child.material) {
      for (const material of [].concat(child.material)) materials.add(material);
    }
  });
  for (const material of materials) {
    material.map?.dispose();
    material.dispose();
  }
  model.removeFromParent();
}
