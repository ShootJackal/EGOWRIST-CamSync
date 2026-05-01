import {
  CameraId,
  CameraStatus,
  CameraCommandResult,
  RecordingSession,
  BridgeHealthResponse,
  BridgeSettings,
} from './types';

export class BridgeClient {
  private baseUrl: string;
  private authToken: string;
  private ws: WebSocket | null = null;
  private wsListeners: Array<(data: unknown) => void> = [];
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(settings: Pick<BridgeSettings, 'bridgeUrl' | 'authToken'>) {
    this.baseUrl = settings.bridgeUrl.replace(/\/$/, '');
    this.authToken = settings.authToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) h['Authorization'] = `Bearer ${this.authToken}`;
    return h;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    timeoutMs = 8000,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        let errorBody: unknown;
        try { errorBody = await res.json(); } catch { errorBody = {}; }
        const msg = (errorBody as { error?: string })?.error ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async health(): Promise<BridgeHealthResponse> {
    return this.request<BridgeHealthResponse>('GET', '/api/health');
  }

  async getCameras(): Promise<CameraStatus[]> {
    const res = await this.request<{ cameras: CameraStatus[] }>('GET', '/api/cameras');
    return res.cameras;
  }

  async getCamera(id: CameraId): Promise<CameraStatus> {
    const res = await this.request<{ camera: CameraStatus }>('GET', `/api/cameras/${id}`);
    return res.camera;
  }

  async connect(id: CameraId): Promise<CameraCommandResult> {
    return this.request<CameraCommandResult>('POST', `/api/cameras/${id}/connect`);
  }

  async disconnect(id: CameraId): Promise<CameraCommandResult> {
    return this.request<CameraCommandResult>('POST', `/api/cameras/${id}/disconnect`);
  }

  async startRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
    return this.request<CameraCommandResult>('POST', `/api/cameras/${id}/start`, { sessionId });
  }

  async stopRecording(id: CameraId, sessionId?: string): Promise<CameraCommandResult> {
    return this.request<CameraCommandResult>('POST', `/api/cameras/${id}/stop`, { sessionId });
  }

  async refreshStatus(id: CameraId): Promise<CameraCommandResult> {
    return this.request<CameraCommandResult>('POST', `/api/cameras/${id}/status`);
  }

  async connectAll(): Promise<CameraCommandResult[]> {
    const res = await this.request<{ results: CameraCommandResult[] }>('POST', '/api/cameras/connect-all');
    return res.results;
  }

  async startAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession }> {
    return this.request<{ results: CameraCommandResult[]; session: RecordingSession }>('POST', '/api/cameras/start-all');
  }

  async stopAll(): Promise<{ results: CameraCommandResult[]; session: RecordingSession | null }> {
    return this.request<{ results: CameraCommandResult[]; session: RecordingSession | null }>('POST', '/api/cameras/stop-all');
  }

  async statusAll(): Promise<CameraStatus[]> {
    const res = await this.request<{ cameras: CameraStatus[] }>('POST', '/api/cameras/status-all');
    return res.cameras;
  }

  async getActiveSession(): Promise<RecordingSession | null> {
    const res = await this.request<{ session: RecordingSession | null }>('GET', '/api/sessions/active');
    return res.session;
  }

  async getSessions(): Promise<RecordingSession[]> {
    const res = await this.request<{ sessions: RecordingSession[] }>('GET', '/api/sessions');
    return res.sessions;
  }

  // WebSocket live updates
  connectWebSocket(onMessage: (data: unknown) => void): () => void {
    this.wsListeners.push(onMessage);
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.openWebSocket();
    }
    return () => {
      this.wsListeners = this.wsListeners.filter((l) => l !== onMessage);
      if (this.wsListeners.length === 0) {
        this.closeWebSocket();
      }
    };
  }

  private openWebSocket() {
    if (this.destroyed) return;
    try {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl, this.authToken ? ['Bearer', this.authToken] : undefined);
      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);
          this.wsListeners.forEach((l) => l(data));
        } catch { /* ignore malformed frames */ }
      };
      this.ws.onclose = () => {
        if (!this.destroyed && this.wsListeners.length > 0) {
          this.wsReconnectTimer = setTimeout(() => this.openWebSocket(), 3000);
        }
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      // WebSocket not available in this environment; callers fall back to polling
    }
  }

  private closeWebSocket() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  destroy() {
    this.destroyed = true;
    this.wsListeners = [];
    this.closeWebSocket();
  }
}
