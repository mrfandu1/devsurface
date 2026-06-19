import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import spawn from 'cross-spawn';
import type { ManagedProcessSnapshot, ProcessLogEvent } from '../types.js';

interface ProcessRecord extends ManagedProcessSnapshot {
  child: ChildProcess;
}

function killChildProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    child.kill();
    return;
  }

  if (process.platform === 'win32') {
    const result = spawn.sync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    if (result.error) {
      child.kill();
    }
    return;
  }

  child.kill();
}

export class ProcessManager extends EventEmitter {
  private readonly processes = new Map<string, ProcessRecord>();
  private readonly logs: ProcessLogEvent[] = [];
  private cleanupInstalled = false;

  start(options: {
    cwd: string;
    script: string;
    command: string;
    args: string[];
    displayCommand: string;
    shell?: boolean;
  }): ManagedProcessSnapshot {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      windowsHide: true
    });

    const pid = String(child.pid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const record: ProcessRecord = {
      child,
      pid,
      script: options.script,
      command: options.displayCommand,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null
    };

    this.processes.set(pid, record);
    this.emitSystem(record, `Started ${options.displayCommand}`);

    child.stdout?.on('data', (chunk: Buffer) => {
      this.emitLog(record, 'stdout', chunk.toString());
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      this.emitLog(record, 'stderr', chunk.toString());
    });

    child.on('error', (error) => {
      record.status = 'failed';
      record.endedAt = new Date().toISOString();
      this.emitLog(record, 'system', error.message);
      this.emit('process', this.snapshot(record));
    });

    child.on('close', (code) => {
      if (record.status === 'stopped') {
        record.exitCode = code;
      } else {
        record.status = code === 0 ? 'exited' : 'failed';
        record.exitCode = code;
      }
      record.endedAt = new Date().toISOString();
      this.emitSystem(record, `Exited with code ${code ?? 'unknown'}`);
      this.emit('process', this.snapshot(record));
    });

    this.emit('process', this.snapshot(record));
    return this.snapshot(record);
  }

  stop(pid: string): boolean {
    const record = this.processes.get(pid);
    if (!record || record.status !== 'running') {
      return false;
    }

    record.status = 'stopped';
    record.endedAt = new Date().toISOString();
    killChildProcessTree(record.child);
    this.emitSystem(record, 'Stopped by DevSurface');
    this.emit('process', this.snapshot(record));
    return true;
  }

  list(): ManagedProcessSnapshot[] {
    return Array.from(this.processes.values()).map((record) => this.snapshot(record));
  }

  listLogs(): ProcessLogEvent[] {
    return [...this.logs];
  }

  killAll(): void {
    for (const record of this.processes.values()) {
      if (record.status === 'running') {
        record.status = 'stopped';
        record.endedAt = new Date().toISOString();
        killChildProcessTree(record.child);
      }
    }
  }

  attachCleanupHandlers(): void {
    if (this.cleanupInstalled) {
      return;
    }

    this.cleanupInstalled = true;
    process.once('exit', () => {
      this.killAll();
    });
    process.once('SIGINT', () => {
      this.killAll();
      process.exit(130);
    });
  }

  private emitLog(record: ProcessRecord, stream: ProcessLogEvent['stream'], message: string): void {
    const event: ProcessLogEvent = {
      pid: record.pid,
      script: record.script,
      stream,
      message,
      timestamp: new Date().toISOString()
    };

    this.logs.push(event);
    if (this.logs.length > 1000) {
      this.logs.splice(0, this.logs.length - 1000);
    }

    this.emit('log', event);
  }

  private emitSystem(record: ProcessRecord, message: string): void {
    this.emitLog(record, 'system', message);
  }

  private snapshot(record: ProcessRecord): ManagedProcessSnapshot {
    return {
      pid: record.pid,
      script: record.script,
      command: record.command,
      status: record.status,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      exitCode: record.exitCode
    };
  }
}
