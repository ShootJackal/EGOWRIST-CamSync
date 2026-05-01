import { CameraController, CameraStatus, CameraCommandResult } from '../cameraControllers/CameraController';
import { MockCameraController } from '../cameraControllers/MockCameraController';
import { RealGoProController } from '../cameraControllers/RealGoProController';
import cameraConfig from '../../config/cameras.json';

export type CameraMode = 'mock' | 'real';

interface CameraConfigEntry {
  id: number;
  name: string;
  ssid?: string;
  password?: string;
  connectionType?: string;
  ip?: string;
  port?: number;
}

export class CameraRegistry {
  private controllers: Map<number, CameraController> = new Map();
  private mode: CameraMode;

  constructor(mode: CameraMode) {
    this.mode = mode;
    this.init();
  }

  private init(): void {
    const configs = cameraConfig as CameraConfigEntry[];
    for (const cfg of configs) {
      let controller: CameraController;
      if (this.mode === 'mock') {
        controller = new MockCameraController({
          id: cfg.id,
          name: cfg.name,
        });
      } else {
        controller = new RealGoProController({
          id: cfg.id,
          name: cfg.name,
          ip: cfg.ip,
          port: cfg.port,
        });
      }
      this.controllers.set(cfg.id, controller);
    }
  }

  get(id: number): CameraController | undefined {
    return this.controllers.get(id);
  }

  getAll(): Array<{ id: number; controller: CameraController }> {
    return Array.from(this.controllers.entries()).map(([id, controller]) => ({ id, controller }));
  }

  ids(): number[] {
    return Array.from(this.controllers.keys()).sort();
  }

  async getAllStatuses(): Promise<CameraStatus[]> {
    return Promise.all(
      this.getAll().map(({ controller }) => controller.getStatus()),
    );
  }

  async connectAll(): Promise<CameraCommandResult[]> {
    return Promise.all(
      this.getAll().map(({ controller }) => controller.connect()),
    );
  }

  async startAll(sessionId?: string): Promise<{ results: CameraCommandResult[]; spreadMs: number }> {
    const starts: number[] = [];
    const results = await Promise.all(
      this.getAll().map(async ({ controller }) => {
        starts.push(Date.now());
        const r = await controller.startRecording(sessionId);
        starts.push(Date.now());
        return r;
      }),
    );
    const spreadMs = starts.length > 1 ? Math.max(...starts) - Math.min(...starts) : 0;
    return { results, spreadMs };
  }

  async stopAll(sessionId?: string): Promise<CameraCommandResult[]> {
    return Promise.all(
      this.getAll().map(({ controller }) => controller.stopRecording(sessionId)),
    );
  }

  async statusAll(): Promise<CameraStatus[]> {
    return Promise.all(
      this.getAll().map(({ controller }) => controller.getStatus()),
    );
  }
}
