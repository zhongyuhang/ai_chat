import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export interface AtomicWriteOptions {
  rename?: typeof rename;
}

const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_DELAY_MS = 25;

export async function atomicWriteText(file: string, content: string, options: AtomicWriteOptions = {}): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporaryFile, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  const renameFile = options.rename ?? rename;
  let lastCause: unknown;
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt += 1) {
    try {
      await renameFile(temporaryFile, file);
      return;
    } catch (cause) {
      lastCause = cause;
      if (attempt < RENAME_ATTEMPTS) await delay(RENAME_RETRY_DELAY_MS * attempt);
    }
  }

  throw Object.assign(new Error(`原子替换失败，恢复文件保留在 ${temporaryFile}`, { cause: lastCause }), {
      code: 'ATOMIC_RENAME_FAILED',
      temporaryFile,
      targetFile: file,
  });
}

export async function atomicWriteJson(file: string, value: unknown, options?: AtomicWriteOptions): Promise<void> {
  await atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`, options);
}
