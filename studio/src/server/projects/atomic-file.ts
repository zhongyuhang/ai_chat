import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AtomicWriteOptions {
  rename?: typeof rename;
}

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

  try {
    await (options.rename ?? rename)(temporaryFile, file);
  } catch (cause) {
    throw Object.assign(new Error(`原子替换失败，恢复文件保留在 ${temporaryFile}`, { cause }), {
      code: 'ATOMIC_RENAME_FAILED',
      temporaryFile,
      targetFile: file,
    });
  }
}

export async function atomicWriteJson(file: string, value: unknown, options?: AtomicWriteOptions): Promise<void> {
  await atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`, options);
}
