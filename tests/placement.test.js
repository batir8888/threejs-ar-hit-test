import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Matrix4, Vector3, Quaternion, PerspectiveCamera } from 'three';
import { HitTestPlacement } from '../src/placement.js';

const floorSpace = { type: 'local-floor' };
const source = {};
const poseAt = (x, y, z, angle = 0) => new Matrix4().compose(
  new Vector3(x, y, z),
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle),
  new Vector3(1, 1, 1),
).toArray();

function frameAt(matrix, tracking = true) {
  return {
    getViewerPose(space) { assert.equal(space, floorSpace); return tracking ? {} : null; },
    getHitTestResults(hitSource) {
      assert.equal(hitSource, source);
      return matrix ? [{ getPose(space) { assert.equal(space, floorSpace); return { transform: { matrix } }; } }] : [];
    },
  };
}

test('размещённая поза не меняется при движении камеры и следующих hit-test', () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const placement = new HitTestPlacement(scene, () => new Group());
  const firstPose = poseAt(1, 0, -2, Math.PI / 3);
  placement.update(frameAt(firstPose), source, floorSpace);
  const object = placement.place('cube');
  scene.updateMatrixWorld(true);
  const fixedWorld = object.matrixWorld.toArray();
  camera.position.set(3, 1.7, 2);
  camera.rotation.y = Math.PI / 2;
  placement.update(frameAt(poseAt(4, 0.8, -5)), source, floorSpace);
  scene.updateMatrixWorld(true);
  assert.deepEqual(object.matrix.toArray(), firstPose);
  assert.deepEqual(object.matrixWorld.toArray(), fixedWorld);
  assert.notDeepEqual(placement.reticle.matrix.toArray(), firstPose);
  assert.equal(object.parent, placement.objects);
  assert.equal(placement.objects.parent, scene);
});

test('при отсутствии поверхности нельзя разместить объект по старой позе', () => {
  const placement = new HitTestPlacement(new Scene(), () => new Group());
  placement.update(frameAt(poseAt(0, 0, -1)), source, floorSpace);
  placement.update(frameAt(null), source, floorSpace);
  assert.equal(placement.reticle.visible, false);
  assert.equal(placement.place('cube'), null);
  assert.equal(placement.count, 0);
});

test('потеря и восстановление трекинга сохраняют прежнюю позу объекта', () => {
  const placement = new HitTestPlacement(new Scene(), () => new Group());
  const matrix = poseAt(0.3, 0.4, -1.6);
  placement.update(frameAt(matrix), source, floorSpace);
  const object = placement.place('chair');
  placement.update(frameAt(matrix, false), source, floorSpace);
  assert.equal(placement.objects.visible, false);
  assert.equal(placement.place('cube'), null);
  placement.update(frameAt(poseAt(2, 0, -1)), source, floorSpace);
  assert.equal(placement.objects.visible, true);
  assert.deepEqual(object.matrix.toArray(), matrix);
});

test('две копии независимы, очистка освобождает каждый объект', () => {
  let disposed = 0;
  const placement = new HitTestPlacement(new Scene(), () => new Group(), (object) => { disposed++; object.removeFromParent(); });
  const a = poseAt(0, 0, -1);
  const b = poseAt(1, 0, -2);
  placement.update(frameAt(a), source, floorSpace);
  const first = placement.place('cube');
  placement.update(frameAt(b), source, floorSpace);
  const second = placement.place('chair');
  assert.deepEqual(first.matrix.toArray(), a);
  assert.deepEqual(second.matrix.toArray(), b);
  placement.reset();
  assert.equal(disposed, 2);
  assert.equal(placement.count, 0);
  assert.equal(placement.hasSurface, false);
});

test('null-поза не показывается как найденная поверхность', () => {
  const placement = new HitTestPlacement(new Scene(), () => new Group());
  placement.update({ getViewerPose: () => ({}), getHitTestResults: () => [{ getPose: () => null }] }, source, floorSpace);
  assert.equal(placement.hasSurface, false);
  assert.equal(placement.reticle.visible, false);
});
