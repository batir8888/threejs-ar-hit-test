import { FINISHES } from './model-manager.js';
import { MODEL_INFO } from './models.js';

export class ObjectController {
  constructor(models, preview, placement) {
    this.models = models;
    this.preview = preview;
    this.placement = placement;
    this.selected = preview;
    this.onChange = () => {};
  }

  get state() { return this.selected.userData.settings; }

  select(id) {
    this.selected = this.placement.objects.children.find((object) => object.uuid === id) ?? this.preview;
    this.onChange();
  }

  setModel(kind) {
    if (!MODEL_INFO[kind]) return;
    this.models.replace(this.selected, kind);
    this.onChange();
  }

  setColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.state.color = color;
    this.models.apply(this.selected);
    this.onChange();
  }

  setFinish(finish) {
    if (!FINISHES[finish]) return;
    this.state.finish = finish;
    this.models.apply(this.selected);
    this.onChange();
  }

  rotate(delta) {
    this.state.angle = (this.state.angle + delta) % (Math.PI * 2);
    this.models.apply(this.selected);
  }

  toggleSpin() {
    this.state.spinning = !this.state.spinning;
    this.onChange();
  }

  update(delta, inAR) {
    const objects = inAR ? this.placement.objects.children : [this.preview];
    for (const object of objects) {
      const state = object.userData.settings;
      if (!state.spinning) continue;
      state.angle = (state.angle + Math.min(delta, 0.05) * Math.PI / 5) % (Math.PI * 2);
      object.getObjectByName('model-content').rotation.y = state.angle;
    }
  }
}
