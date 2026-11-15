import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { ExportError, abortError, type ProgressFn } from './types';

export interface FfmpegInput {
  name: string;
  data: Uint8Array;
}

/**
 * Jalankan ffmpeg.wasm (dimuat malas, single-thread — tidak butuh
 * SharedArrayBuffer / header COOP-COEP). Mengembalikan file keluaran.
 */
export async function runFfmpeg(
  inputs: FfmpegInput[],
  args: string[],
  output: string,
  durationSec: number,
  onProgress: ProgressFn,
  signal: AbortSignal,
  stage: string,
): Promise<Uint8Array> {
  if (typeof WebAssembly === 'undefined') throw new ExportError('Browser ini tidak mendukung WebAssembly.');
  onProgress({ ratio: 0, stage: 'Memuat ffmpeg.wasm…' });
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const ff = new FFmpeg();
  const onAbort = () => ff.terminate();
  signal.addEventListener('abort', onAbort);
  const tail: string[] = [];
  try {
    ff.on('log', ({ message }) => {
      tail.push(message);
      if (tail.length > 8) tail.shift();
    });
    ff.on('progress', ({ time }) => {
      // `time` dalam mikrodetik media yang sudah diproses
      const ratio = durationSec > 0 ? Math.min(1, Math.max(0, time / 1e6 / durationSec)) : 0;
      onProgress({ ratio, stage });
    });
    await ff.load({ coreURL, wasmURL });
    if (signal.aborted) throw abortError();
    for (const f of inputs) await ff.writeFile(f.name, f.data);
    const code = await ff.exec(args);
    if (signal.aborted) throw abortError();
    if (code !== 0) throw new ExportError(`ffmpeg gagal (kode ${code}): ${tail.slice(-2).join(' ')}`);
    const out = await ff.readFile(output);
    if (typeof out === 'string' || out.length === 0) throw new ExportError('ffmpeg tidak menghasilkan file.');
    return out;
  } catch (e) {
    if (signal.aborted) throw abortError();
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      ff.terminate();
    } catch {
      /* sudah berhenti */
    }
  }
}
