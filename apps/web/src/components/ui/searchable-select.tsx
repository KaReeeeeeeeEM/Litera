"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = { label: string; value: string };

export function SearchableSelect({ className, disabled, emptyMessage = "No matching options.", onValueChange, options, placeholder = "Search and select…", value }: { className?: string; disabled?: boolean; emptyMessage?: string; onValueChange: (value: string) => void; options: SearchableSelectOption[]; placeholder?: string; value?: string }) {
  const values = options.map((option) => option.value);
  const labelFor = (item: string) => options.find((option) => option.value === item)?.label ?? item;
  return <Combobox disabled={disabled} itemToStringValue={labelFor} items={values} onValueChange={(next) => next && onValueChange(next)} value={value ?? null}><ComboboxInput className={cn("w-full", className)} placeholder={placeholder}/><ComboboxContent><ComboboxEmpty>{emptyMessage}</ComboboxEmpty><ComboboxList>{(item) => <ComboboxItem key={item} value={item}>{labelFor(item)}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox>;
}
