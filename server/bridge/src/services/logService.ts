import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  sessionId: string | null;
  cameraId: number | 'all';
  command: string;
  commandIssuedAt: string;
  responseReceivedAt: string;
  latencyMs: number | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse?: unknown;
}

export class LogService {
  private logDir: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch { /* already exists */ }
  }

  private logFilePath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `session-${date}.jsonl`);
  }

  write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.logFilePath(), line, 'utf8');
    } catch (err) {
      console.error('[LogService] Failed to write log entry:', err);
    }
  }

  log(
    cameraId: number | 'all',
    command: string,
    issuedAt: Date,
    success: boolean,
    latencyMs: number,
    options: {
      sessionId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      rawResponse?: unknown;
    } = {},
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      sessionId: options.sessionId ?? null,
      cameraId,
      command,
      commandIssuedAt: issuedAt.toISOString(),
      responseReceivedAt: new Date().toISOString(),
      latencyMs,
      success,
      errorCode: options.errorCode ?? null,
      errorMessage: options.errorMessage ?? null,
      rawResponse: options.rawResponse,
    });
  }
}
