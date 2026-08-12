import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { app } from 'electron';
import { WebSocket,WebSocketServer } from 'ws';

import { AsrApiCode, AsrRealtimeEventType, type AsrRealtimeSessionData } from '../../../shared/asr/constants';

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const MAX_SESSION_SECONDS = 60;
const SESSION_TTL_MS = 90_000;
const RECOGNITION_TIMEOUT_MS = 60_000;

type LocalSocket = WebSocket & { __ended?: boolean };

const createWavHeader = (dataSize: number): Buffer => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return header;
};

const powershellScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
if (-not $recognizerInfo) { throw 'Windows Chinese speech recognizer is not installed' }
$engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizerInfo)
try {
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.SetInputToWaveFile($env:LOGICNEST_ASR_WAV_PATH)
  $result = $engine.Recognize()
  if ($result) {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::Write($result.Text)
  }
} finally {
  $engine.Dispose()
}
`;

const runPowerShellRecognition = (wavPath: string): Promise<string> => new Promise((resolve, reject) => {
  const encoded = Buffer.from(powershellScript, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', encoded,
  ], { windowsHide: true, env: { ...process.env, LOGICNEST_ASR_WAV_PATH: wavPath } });
  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error('Windows speech recognition timed out'));
  }, RECOGNITION_TIMEOUT_MS);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  child.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once('close', (code) => {
    clearTimeout(timeout);
    if (code !== 0) {
      reject(new Error(stderr.trim() || `Windows speech recognition exited with code ${code ?? 'unknown'}`));
      return;
    }
    resolve(stdout.trim());
  });
});

const resolveAsrResourcePath = (...segments: string[]): string => {
  const roots = app.isPackaged
    ? [process.resourcesPath]
    : [
      path.resolve(__dirname, '..', 'resources'),
      path.resolve(__dirname, '..', '..', '..', '..', 'resources'),
      path.resolve(process.cwd(), 'resources'),
    ];
  return path.join(roots.find((root) => existsSync(root)) || roots[0], ...segments);
};

const runWhisperRecognition = (wavPath: string): Promise<string> | null => {
  const pythonPath = resolveAsrResourcePath('python-win', 'python.exe');
  const scriptPath = resolveAsrResourcePath('asr-transcribe.py');
  const modelPath = resolveAsrResourcePath('asr-models', 'faster-whisper-small');
  if (!existsSync(pythonPath) || !existsSync(scriptPath) || !existsSync(path.join(modelPath, 'model.bin'))) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, '--model', modelPath, '--audio', wavPath], {
      windowsHide: true,
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        HF_HUB_OFFLINE: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Offline Whisper recognition timed out'));
    }, RECOGNITION_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Offline Whisper exited with code ${code ?? 'unknown'}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
};

const recognizeWav = async (frames: Buffer[]): Promise<string> => {
  if (frames.length === 0) throw new Error('No audio was captured');
  const first = frames[0];
  const pcm = first.length >= 44 && first.subarray(0, 4).toString('ascii') === 'RIFF'
    ? Buffer.concat([first.subarray(44), ...frames.slice(1)])
    : Buffer.concat(frames);
  if (pcm.length < SAMPLE_RATE * BYTES_PER_SAMPLE * 0.3) throw new Error('Audio is too short');
  const maxBytes = SAMPLE_RATE * BYTES_PER_SAMPLE * MAX_SESSION_SECONDS;
  const wav = Buffer.concat([createWavHeader(Math.min(pcm.length, maxBytes)), pcm.subarray(0, maxBytes)]);
  const wavPath = path.join(os.tmpdir(), `logicnest-asr-${randomUUID()}.wav`);
  await fs.writeFile(wavPath, wav, { mode: 0o600 });
  try {
    const whisper = runWhisperRecognition(wavPath);
    if (whisper) {
      try {
        const text = await whisper;
        if (text) return text;
      } catch (error) {
        console.warn(`[ASR] offline Whisper failed; falling back to Windows speech; message=${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    return await runPowerShellRecognition(wavPath);
  } finally {
    await fs.unlink(wavPath).catch((): void => undefined);
  }
};

const sendError = (socket: LocalSocket, message: string): void => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: AsrRealtimeEventType.Error, code: AsrApiCode.RecognitionFailed, message }));
  }
};

export const createLocalWindowsAsrSession = async (): Promise<AsrRealtimeSessionData> => {
  const requestId = randomUUID();
  const token = randomUUID();
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const closeServer = () => {
    server.clients.forEach((client) => client.close(1000));
    server.close();
  };
  const expiry = setTimeout(closeServer, SESSION_TTL_MS);
  expiry.unref?.();
  server.on('connection', (socket, request) => {
    const localSocket = socket as LocalSocket;
    const url = new URL(request.url ?? '/', 'ws://127.0.0.1');
    if (url.searchParams.get('token') !== token) {
      socket.close(1008, 'Invalid ASR session token');
      return;
    }
    const frames: Buffer[] = [];
    let receivedBytes = 0;
    localSocket.on('message', async (payload, isBinary) => {
      if (localSocket.__ended) return;
      if (isBinary) {
        const frame = Buffer.from(payload as Buffer);
        frames.push(frame);
        receivedBytes += frame.byteLength;
        return;
      }
      let message: { end?: string } | null = null;
      try { message = JSON.parse(payload.toString()) as { end?: string }; } catch { return; }
      if (message?.end !== 'true') return;
      localSocket.__ended = true;
      console.log(`[ASR] local Windows session ending; requestId=${requestId}, frames=${frames.length}, bytes=${receivedBytes}`);
      try {
        const text = await recognizeWav(frames);
        if (!text) throw new Error('No speech was recognized');
        localSocket.send(JSON.stringify({
          type: AsrRealtimeEventType.Recognition,
          requestId,
          text,
          raw: { action: 'result', result: [{ seg_id: 0, st: { sentence: text, partial: false } }] },
        }));
        localSocket.send(JSON.stringify({ type: AsrRealtimeEventType.Closed, requestId }));
      } catch (error) {
        console.warn(`[ASR] local Windows recognition failed; requestId=${requestId}, message=${error instanceof Error ? error.message : 'unknown error'}`);
        sendError(localSocket, error instanceof Error ? error.message : 'Windows speech recognition failed');
      } finally {
        setTimeout(() => localSocket.close(1000), 25).unref?.();
        clearTimeout(expiry);
        server.close();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    clearTimeout(expiry);
    server.close();
    throw new Error('Failed to start local ASR session');
  }
  return {
    requestId,
    wsUrl: `ws://127.0.0.1:${address.port}/?token=${encodeURIComponent(token)}`,
    expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000),
    chunkIntervalMillis: 200,
    maxSessionSeconds: MAX_SESSION_SECONDS,
    maxConcurrentSessions: 1,
    usedSecondsToday: 0,
    remainingSecondsToday: 20 * 60,
    limitSecondsToday: 20 * 60,
  };
};
