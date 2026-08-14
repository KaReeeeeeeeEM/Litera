"use client";

import { BookOpen, Download, FileUp, HardDrive, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type DeviceBook = { id: string; name: string; size: number; type: string; addedAt: string; file: Blob };
const databaseName = "litera-device-library";
const storeName = "books";

function openDatabase() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(databaseName, 1); request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function readBooks() { const database = await openDatabase(); return new Promise<DeviceBook[]>((resolve, reject) => { const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll(); request.onsuccess = () => resolve((request.result as DeviceBook[]).sort((a, b) => b.addedAt.localeCompare(a.addedAt))); request.onerror = () => reject(request.error); }).finally(() => database.close()); }
async function saveBook(book: DeviceBook) { const database = await openDatabase(); await new Promise<void>((resolve, reject) => { const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(book); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); database.close(); }
async function removeBook(id: string) { const database = await openDatabase(); await new Promise<void>((resolve, reject) => { const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); database.close(); }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

export function DeviceLibrary() {
  const [books, setBooks] = useState<DeviceBook[]>([]);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void readBooks().then(setBooks).catch(() => toast.error("Litera could not read the device library.")).finally(() => setReady(true)); }, []);

  async function importBooks(event: React.ChangeEvent<HTMLInputElement>) { const files = Array.from(event.target.files ?? []); try { for (const file of files) await saveBook({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type || "application/octet-stream", addedAt: new Date().toISOString(), file }); setBooks(await readBooks()); if (files.length) toast.success(files.length === 1 ? "Book saved on this device." : `${files.length} books saved on this device.`); } catch { toast.error("Litera could not save the selected book on this device."); } finally { event.target.value = ""; } }
  function openBook(book: DeviceBook) { const url = URL.createObjectURL(book.file); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  async function deleteBook(book: DeviceBook) { try { await removeBook(book.id); setBooks(current => current.filter(({ id }) => id !== book.id)); toast.success(`${book.name} was removed from this device.`); } catch { toast.error("Litera could not remove that book."); } }

  return <main className="min-h-screen bg-muted/25"><header className="border-b bg-background/90 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8"><BrandMark className="text-3xl"/><div className="flex items-center gap-3"><Badge variant="secondary"><HardDrive/>Device library</Badge><ThemeToggle/></div></div></header><section className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16"><div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">No account required</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Your books stay on this device.</h1><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Import a source book and continue locally. Litera stores the original file in this application’s device storage and does not upload it to an account.</p></div><Button onClick={() => inputRef.current?.click()} size="lg"><FileUp data-icon="inline-start"/>Import books</Button><input accept=".pdf,.epub,.zip,application/pdf,application/epub+zip" className="sr-only" multiple onChange={importBooks} ref={inputRef} type="file"/></div><div className="mt-12">{ready && books.length === 0 ? <Empty className="min-h-80 border border-dashed bg-background"><EmptyHeader><EmptyMedia variant="icon"><BookOpen/></EmptyMedia><EmptyTitle>Your device library is empty</EmptyTitle><EmptyDescription>Import a PDF, EPUB, or structured package to begin. The source remains available only on this device.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={() => inputRef.current?.click()}><FileUp data-icon="inline-start"/>Choose books</Button></EmptyContent></Empty> : null}{books.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{books.map(book => <Card className="motion-card" key={book.id}><CardHeader><CardTitle className="truncate pr-10">{book.name}</CardTitle><CardDescription>{formatBytes(book.size)} · Saved {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(book.addedAt))}</CardDescription><CardAction><Button aria-label={`Remove ${book.name}`} onClick={() => deleteBook(book)} size="icon-sm" variant="ghost"><Trash2/></Button></CardAction></CardHeader><CardContent><Button className="w-full" onClick={() => openBook(book)} variant="outline"><Download data-icon="inline-start"/>Open source</Button></CardContent></Card>)}</div> : null}</div></section></main>;
}
