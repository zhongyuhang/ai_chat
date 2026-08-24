interface DraftRecord {
  key: string;
  content: string;
  updatedAt: string;
}

const DATABASE = 'ai-novel-studio-drafts';
const STORE = 'drafts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function draftKey(projectId: string, chapterId: string) {
  return `${projectId}:${chapterId}`;
}

export async function readDraft(projectId: string, chapterId: string): Promise<DraftRecord | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE);
    const request = transaction.objectStore(STORE).get(draftKey(projectId, chapterId));
    request.onsuccess = () => resolve((request.result as DraftRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function writeDraft(projectId: string, chapterId: string, content: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({ key: draftKey(projectId, chapterId), content, updatedAt: new Date().toISOString() } satisfies DraftRecord);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearDraft(projectId: string, chapterId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(draftKey(projectId, chapterId));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}
