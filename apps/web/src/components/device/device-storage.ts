import type { DeviceBook } from "@/components/device/device-types";

const databaseName = "litera-device-library";
const booksStore = "books";
const settingsStore = "settings";

export function openDeviceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(booksStore)) request.result.createObjectStore(booksStore, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(settingsStore)) request.result.createObjectStore(settingsStore);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readBooks() {
  const database = await openDeviceDatabase();
  return new Promise<DeviceBook[]>((resolve, reject) => {
    const request = database.transaction(booksStore, "readonly").objectStore(booksStore).getAll();
    request.onsuccess = () => resolve((request.result as DeviceBook[])
      .map(hydrateBookBlobs)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveBook(book: DeviceBook) {
  const persistableBook = await materializeBookBlobs(book);
  const database = await openDeviceDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(booksStore, "readwrite");
    const request = transaction.objectStore(booksStore).put(persistableBook);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("The book save was aborted."));
  });
  database.close();
}

async function materializeBookBlobs(book: DeviceBook): Promise<DeviceBook> {
  const speechEntries = await Promise.all(
    (book.speechEntries ?? []).map(async (entry) => {
      try {
        const existingBytes = entry.audioBytes;
        if (existingBytes)
          return { ...entry, audio: new Blob([], { type: entry.audio.type || "audio/mpeg" }), audioBytes: existingBytes };
        if (!(entry.audio instanceof Blob) || entry.audio.size === 0)
          return { ...entry, audio: new Blob([], { type: "audio/mpeg" }), audioBytes: undefined };
        const audioBytes = await entry.audio.arrayBuffer();
        return {
          ...entry,
          audio: new Blob([], { type: entry.audio.type || "audio/mpeg" }),
          audioBytes,
        };
      } catch {
        // Preserve catalog identity so the workspace can diagnose the missing
        // clip, but never let one expired native Blob abort the whole book.
        return { ...entry, audio: new Blob([], { type: "audio/mpeg" }), audioBytes: undefined };
      }
    }),
  );
  const extractedPages = await Promise.all(
    (book.extractedPages ?? []).map(async (page) => ({
      ...page,
      thumbnail: page.thumbnailBytes
        ? new Blob([], { type: "image/png" })
        : await durableBlob(page.thumbnail, "image/png"),
      assets: await Promise.all(
        (page.assets ?? []).map(async (asset) => ({
          ...asset,
          blob: asset.bytes
            ? new Blob([], { type: asset.blob?.type || "image/png" })
            : (await durableBlob(asset.blob, "image/png")) ?? new Blob([], { type: "image/png" }),
        })),
      ),
    })),
  );
  const file = book.sourceBytes
    ? new Blob([], { type: book.type || "application/octet-stream" })
    : (await durableBlob(book.file, book.type)) ?? new Blob([], { type: book.type });
  return {
    ...book,
    file,
    extractedPages,
    speechEntries,
    exportArtifact: book.exportArtifact
      ? {
          ...book.exportArtifact,
          blob:
            (await durableBlob(book.exportArtifact.blob, book.exportArtifact.mimeType)) ??
            new Blob([], { type: book.exportArtifact.mimeType }),
        }
      : undefined,
  };
}

function hydrateBookBlobs(book: DeviceBook): DeviceBook {
  if (!book.speechEntries?.length) return book;
  return {
    ...book,
    speechEntries: book.speechEntries.map((entry) => ({
      ...entry,
      audio: entry.audioBytes
        ? new Blob([entry.audioBytes], { type: entry.audio.type || "audio/mpeg" })
        : entry.audio,
    })),
  };
}

async function durableBlob(blob: Blob | undefined, fallbackType: string) {
  if (!(blob instanceof Blob) || blob.size === 0) return undefined;
  try {
    return new Blob([await blob.arrayBuffer()], {
      type: blob.type || fallbackType || "application/octet-stream",
    });
  } catch {
    return undefined;
  }
}

export async function removeBook(id: string) {
  const database = await openDeviceDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(booksStore, "readwrite");
    const request = transaction.objectStore(booksStore).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("The book removal was aborted."));
  });
  database.close();
}

export async function readSetting<T>(key: string) {
  const database = await openDeviceDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const request = database.transaction(settingsStore, "readonly").objectStore(settingsStore).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function writeSetting<T>(key: string, value: T) {
  const database = await openDeviceDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(settingsStore, "readwrite").objectStore(settingsStore).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}
