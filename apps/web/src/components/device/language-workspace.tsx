"use client";

import { Check, Languages } from "lucide-react";
import { useMemo, useState } from "react";
import type { DeviceBook } from "@/components/device/device-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";

const names = new Intl.DisplayNames(["en"], { type: "language" });

export function LanguageWorkspace({ book, onChange }: { book: DeviceBook; onChange: (book: DeviceBook, summary?: string) => Promise<void> }) {
  const catalogs = book.languageCatalogs ?? {};
  const languages = Object.keys(catalogs);
  const [language, setLanguage] = useState(languages[0] ?? "");
  const selectedLanguage = catalogs[language] ? language : languages[0] ?? "";
  const catalog = catalogs[selectedLanguage];
  const sourceById = useMemo(() => new Map((book.sourceTextCatalog ?? []).map(entry => [entry.id, entry])), [book.sourceTextCatalog]);
  async function updateEntry(id: string, text: string) {
    if (!catalog) return;
    const next = { ...catalog, entries: catalog.entries.map(entry => entry.id === id ? { ...entry, text } : entry) };
    await onChange({ ...book, languageCatalogs: { ...catalogs, [selectedLanguage]: next } }, `Edited ${displayLanguage(selectedLanguage)} translation`);
  }
  return <Card className="mt-6 overflow-hidden"><CardHeader><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><Languages/>Language catalog</CardTitle><CardDescription className="mt-1">Stable text IDs with side-by-side translation review.</CardDescription></div>{languages.length ? <SearchableSelect className="sm:w-64" onValueChange={setLanguage} options={languages.map(code => ({ value: code, label: displayLanguage(code) }))} value={selectedLanguage}/> : null}</div></CardHeader><CardContent>{catalog ? <><div className="mb-4 flex flex-wrap gap-2"><Badge variant="secondary"><Check/> {catalog.entries.length} translated entries</Badge><Badge variant="outline">{displayLanguage(catalog.sourceLanguage)} → {displayLanguage(catalog.language)}</Badge></div><ScrollArea className="h-[42rem]"><ol className="grid gap-3 pr-3">{catalog.entries.map(entry => <li className="grid gap-3 rounded-xl border p-4 lg:grid-cols-2" key={`${selectedLanguage}-${entry.id}`}><div className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><Badge variant="outline">Page {entry.pageNumber}</Badge><code className="truncate text-[10px] text-muted-foreground">{entry.id}</code></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{sourceById.get(entry.id)?.text}</p></div><div><Textarea aria-label={`Translation for ${entry.id}`} className="min-h-28" defaultValue={entry.text} key={`${selectedLanguage}-${entry.id}-${entry.text}`} onBlur={event => { if (event.target.value !== entry.text) void updateEntry(entry.id, event.target.value); }}/></div></li>)}</ol></ScrollArea></> : <div className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground"><span>Run Language after Storyboard to build and translate the book text catalog.</span></div>}</CardContent></Card>;
}

function displayLanguage(code: string) { try { return names.of(code) ?? code; } catch { return code; } }
