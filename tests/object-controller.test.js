import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Matrix4, Vector3, Box3 } from 'three';
import { ModelManager } from '../src/model-manager.js';
import { ObjectController } from '../src/object-controller.js';
import { HitTestPlacement } from '../src/placement.js';
import { disposeModel } from '../src/models.js';

function setup() {
  const models = new ModelManager(() => null);
  const preview = models.create();
  const placement = new HitTestPlacement(new Scene(), () => models.create(editor.state), disposeModel);
  const editor = new ObjectController(models, preview, placement);
  placement.hasSurface = placement.hasTracking = true;
  placement.reticle.matrix.makeTranslation(1, 0.4, -2);
  const object = placement.place('cube');
  editor.select(object.uuid);
  return { models, preview, placement, editor, object };
}

test('поворот и замена сохраняют позу hit-test и настройки выбранного объекта', () => {
  const { editor, object } = setup();
  const pose = object.matrix.toArray();
  editor.setColor('#79b5ee');
  editor.setFinish('metal');
  editor.rotate(Math.PI / 4);
  editor.toggleSpin();
  editor.setModel('chair');
  assert.deepEqual(object.matrix.toArray(), pose);
  assert.equal(object.getObjectByName('model-content').rotation.y, Math.PI / 4);
  assert.equal(editor.state.color, '#79b5ee');
  assert.equal(editor.state.finish, 'metal');
  assert.equal(editor.state.spinning, true);
  const materials = [];
  object.traverse((mesh) => { if (mesh.material?.userData.editable) materials.push(mesh.material); });
  assert.ok(materials.length > 0);
  for (const material of materials) {
    assert.equal(material.color.getHexString(), '79b5ee');
    assert.equal(material.metalness, 0.95);
    assert.equal(material.roughness, 0.18);
  }
});

test('редактирование одной копии не меняет другую или предпросмотр', () => {
  const { editor, placement, object, preview } = setup();
  const second = placement.place('cube');
  editor.setColor('#ef8068');
  editor.rotate(1);
  assert.equal(object.userData.settings.color, '#ef8068');
  assert.equal(second.userData.settings.color, '#b9e67d');
  assert.equal(preview.userData.settings.color, '#b9e67d');
  assert.equal(second.getObjectByName('model-content').rotation.y, 0);
});

test('автовращение зависит от времени, останавливается и не сдвигает объект', () => {
  const { editor, object } = setup();
  const pose = object.matrix.clone();
  editor.toggleSpin();
  for (let i = 0; i < 60; i++) editor.update(1 / 60, true);
  assert.ok(Math.abs(editor.state.angle - Math.PI / 5) < 1e-10);
  editor.toggleSpin();
  const stopped = editor.state.angle;
  editor.update(1, true);
  assert.equal(editor.state.angle, stopped);
  assert.ok(object.matrix.equals(pose));
});

test('очистка возвращает выбор к новому объекту, новая копия наследует его настройки', () => {
  const { editor, placement } = setup();
  placement.clear();
  editor.select('');
  editor.setModel('sphere');
  editor.setFinish('metal');
  const object = placement.place('sphere');
  assert.equal(placement.count, 1);
  assert.equal(object.userData.kind, 'sphere');
  assert.equal(object.userData.settings.finish, 'metal');
});

test('замена освобождает старые ресурсы, геометрия стоит на опорной плоскости', () => {
  const { editor, object, models } = setup();
  let disposed = 0;
  object.traverse((mesh) => mesh.geometry?.addEventListener('dispose', () => disposed++));
  editor.setModel('sphere');
  assert.ok(disposed > 0);
  for (const kind of ['cube', 'chair', 'sphere']) {
    const root = models.create({ ...editor.state, kind, angle: 0 });
    const box = new Box3().setFromObject(root);
    assert.ok(Math.abs(box.min.y) < 1e-6, `${kind} rests on y=0`);
    assert.ok(box.getSize(new Vector3()).y > 0.25);
    disposeModel(root);
  }
});

test('повторные замены не накапливают дочерние модели и сохраняют трансформацию', () => {
  const { editor, object } = setup();
  const pose = new Matrix4().copy(object.matrix);
  for (let i = 0; i < 30; i++) editor.setModel(i % 2 ? 'chair' : 'cube');
  assert.equal(object.children.length, 1);
  assert.ok(object.matrix.equals(pose));
});
