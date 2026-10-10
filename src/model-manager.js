import { Group } from 'three';
import { MODEL_INFO, createModel, createContactShadow, disposeModel } from './models.js';

export const FINISHES = {
  matte: { roughness: 0.9, metalness: 0 },
  satin: { roughness: 0.35, metalness: 0.12 },
  metal: { roughness: 0.18, metalness: 0.95 },
};
export const DEFAULT_STATE = { kind: 'cube', color: '#b9e67d', finish: 'satin', angle: 0, spinning: false };

// Внешняя группа хранит неизменную позу hit-test, внутренняя — поворот модели.
export class ModelManager {
  constructor(shadowFactory = createContactShadow) {
    this.shadowFactory = shadowFactory;
  }

  create(state = DEFAULT_STATE) {
    const root = new Group();
    root.userData.settings = { ...state };
    this.replace(root, state.kind);
    return root;
  }

  replace(root, kind) {
    if (!MODEL_INFO[kind]) return;
    for (const child of [...root.children]) disposeModel(child);
    root.userData.settings.kind = kind;
    root.userData.kind = kind;
    const content = createModel(kind);
    content.name = 'model-content';
    root.add(content);
    const shadow = this.shadowFactory(kind === 'chair' ? 0.5 : 0.3);
    if (shadow) root.add(shadow);
    this.apply(root);
  }

  apply(root) {
    const state = root.userData.settings;
    const content = root.getObjectByName('model-content');
    content.rotation.y = state.angle;
    content.traverse((mesh) => {
      for (const material of [].concat(mesh.material ?? [])) {
        if (!material.userData.editable) continue;
        material.color.set(state.color);
        Object.assign(material, FINISHES[state.finish]);
      }
    });
  }
}
