import { MODEL_INFO } from './models.js';

export class UIController {
  constructor(editor, placement) {
    this.editor = editor;
    this.placement = placement;
    this.panel = document.querySelector('#object-controls');
    this.previewHost = document.querySelector('#preview-controls-host');
    this.arHost = document.querySelector('#ar-controls-host');
    this.object = this.panel.querySelector('#selected-object');
    this.kind = this.panel.querySelector('#model-kind');
    this.finish = this.panel.querySelector('#material-finish');
    this.spin = this.panel.querySelector('#auto-rotate');
    this.object.addEventListener('change', () => editor.select(this.object.value));
    this.kind.addEventListener('change', () => editor.setModel(this.kind.value));
    this.finish.addEventListener('change', () => editor.setFinish(this.finish.value));
    this.panel.querySelectorAll('[data-color]').forEach((button) => {
      button.addEventListener('click', () => editor.setColor(button.dataset.color));
    });
    this.panel.querySelector('#rotate-left').addEventListener('click', () => editor.rotate(-Math.PI / 12));
    this.panel.querySelector('#rotate-right').addEventListener('click', () => editor.rotate(Math.PI / 12));
    this.spin.addEventListener('click', () => editor.toggleSpin());
    document.querySelector('#xr-overlay').addEventListener('beforexrselect', (event) => {
      if (event.target.closest('button, select, input, label, summary, .xr-control')) event.preventDefault();
    });
    editor.onChange = () => this.render();
    this.render();
  }

  setAR(active) {
    (active ? this.arHost : this.previewHost).append(this.panel);
    this.panel.querySelector('#object-selector-row').hidden = !active;
    this.panel.open = !active;
    this.render();
  }

  render() {
    const { state } = this.editor;
    this.object.replaceChildren(new Option('Новый объект', ''));
    this.placement.objects.children.forEach((object, index) => {
      this.object.add(new Option(`${index + 1}. ${MODEL_INFO[object.userData.kind].name}`, object.uuid));
    });
    this.object.value = this.editor.selected === this.editor.preview ? '' : this.editor.selected.uuid;
    this.kind.value = state.kind;
    this.finish.value = state.finish;
    this.spin.setAttribute('aria-pressed', String(state.spinning));
    this.spin.textContent = state.spinning ? 'Стоп' : 'Авто';
    this.panel.querySelectorAll('[data-color]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.color === state.color));
    });
    const info = MODEL_INFO[this.editor.preview.userData.kind];
    document.querySelector('#object-name').textContent = info.name;
    document.querySelector('#preview-size').textContent = info.size;
    document.querySelector('#preview-stage').setAttribute('aria-label', `Интерактивный 3D-просмотр: ${info.name}`);
    const index = this.placement.objects.children.indexOf(this.editor.selected);
    this.panel.querySelector('#selection-label').textContent = index < 0
      ? 'Настройки нового объекта' : `Объект ${index + 1} · ${MODEL_INFO[state.kind].name}`;
  }
}
