import * as THREE from 'three';

export function createReticle() {
  const reticle = new THREE.Group();
  reticle.name = 'Маркер hit-test';
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: 0xc5f873, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 64).rotateX(-Math.PI / 2), material);
  ring.position.y = 0.003;
  reticle.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.009, 24).rotateX(-Math.PI / 2), material);
  dot.position.y = 0.003;
  reticle.add(dot);
  return reticle;
}

export class HitTestPlacement {
  constructor(scene, makeModel, disposeModel = (model) => model.removeFromParent()) {
    this.makeModel = makeModel;
    this.disposeModel = disposeModel;
    this.reticle = createReticle();
    this.objects = new THREE.Group();
    this.objects.name = 'Объекты в local-floor';
    scene.add(this.objects, this.reticle);
    this.hasSurface = false;
    this.hasTracking = false;
  }

  update(frame, hitTestSource, referenceSpace) {
    // Позы hit-test и камеры должны использовать одно и то же пространство.
    this.hasTracking = Boolean(frame.getViewerPose(referenceSpace));
    this.objects.visible = this.hasTracking;
    this.hideReticle();
    if (!this.hasTracking || !hitTestSource) return;

    const results = frame.getHitTestResults(hitTestSource);
    for (const hit of results) {
      const pose = hit.getPose(referenceSpace);
      if (!pose) continue;
      this.reticle.matrix.fromArray(pose.transform.matrix);
      this.reticle.matrixWorldNeedsUpdate = true;
      this.reticle.visible = true;
      this.hasSurface = true;
      break;
    }
  }

  place(kind) {
    if (!this.hasSurface || !this.hasTracking) return null;
    const object = this.makeModel(kind);
    // Независимая копия позы. Дальнейшие кадры обновляют только маркер.
    // Родитель объектов — сцена, её система координат совпадает с local-floor.
    object.matrixAutoUpdate = false;
    object.matrix.copy(this.reticle.matrix);
    object.matrixWorldNeedsUpdate = true;
    this.objects.add(object);
    return object;
  }

  hideReticle() {
    this.hasSurface = false;
    this.reticle.visible = false;
  }

  clear() {
    for (const object of [...this.objects.children]) this.disposeModel(object);
  }

  reset() {
    this.clear();
    this.hideReticle();
    this.hasTracking = false;
    this.objects.visible = true;
  }

  get count() {
    return this.objects.children.length;
  }
}
