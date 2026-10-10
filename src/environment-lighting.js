import { PMREMGenerator, HemisphereLight } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class EnvironmentLighting {
  constructor(renderer, scenes) {
    this.renderer = renderer;
    this.scenes = scenes;
    this.target = null;
    this.status = 'loading';
    for (const scene of scenes) scene.add(new HemisphereLight(0xffffff, 0x444444, 0.25));
  }

  async load(url) {
    const pmrem = new PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    // Окружение доступно даже при ошибке загрузки HDRI.
    const room = new RoomEnvironment();
    this.setTarget(pmrem.fromScene(room, 0.04));
    room.dispose();
    let hdr;
    try {
      hdr = await new HDRLoader().loadAsync(url);
      this.setTarget(pmrem.fromEquirectangular(hdr));
      this.status = 'hdri';
    } catch (error) {
      this.status = 'fallback';
      console.warn('HDRI unavailable; using studio environment.', error);
    } finally {
      hdr?.dispose();
      pmrem.dispose();
    }
    return this.status;
  }

  setTarget(target) {
    const previous = this.target;
    this.target = target;
    for (const scene of this.scenes) {
      scene.environment = target.texture;
      scene.environmentIntensity = 1;
      // background остаётся null, чтобы не перекрывать камеру в AR.
    }
    previous?.dispose();
  }
}
