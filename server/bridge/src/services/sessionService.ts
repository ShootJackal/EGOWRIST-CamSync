import { v4 as uuidv4 } from 'uuid';

export interface RecordingSession {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number | null;
  cameraIds: number[];
  commandSpreadMs: number | null;
}

export class SessionService {
  private active: RecordingSession | null = null;
  private history: RecordingSession[] = [];

  startSession(cameraIds: number[], commandSpreadMs?: number): RecordingSession {
    const session: RecordingSession = {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      durationMs: null,
      cameraIds,
      commandSpreadMs: commandSpreadMs ?? null,
    };
    this.active = session;
    this.history.push(session);
    return session;
  }

  stopSession(): RecordingSession | null {
    if (!this.active) return null;
    this.active.stoppedAt = new Date().toISOString();
    this.active.durationMs =
      new Date(this.active.stoppedAt).getTime() - new Date(this.active.startedAt).getTime();
    const ended = this.active;
    this.active = null;
    return ended;
  }

  getActive(): RecordingSession | null {
    return this.active;
  }

  setActiveCommandSpread(spreadMs: number): void {
    if (this.active) this.active.commandSpreadMs = spreadMs;
  }

  getHistory(): RecordingSession[] {
    return [...this.history];
  }
}
