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
    request.onsuccess = () => resolve((request.result as DeviceBook[]).sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveBook(book: DeviceBook) {
  const database = await openDeviceDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(booksStore, "readwrite").objectStore(booksStore).put(book);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}

export async function removeBook(id: string) {
  const database = await openDeviceDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(booksStore, "readwrite").objectStore(booksStore).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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
