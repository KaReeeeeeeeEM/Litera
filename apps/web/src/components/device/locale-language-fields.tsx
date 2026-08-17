"use client";

import { Languages, MapPin } from "lucide-react";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type LocaleDefinition = { code: string; label: string; regions: Array<{ code: string; label: string }> };

const localeDefinitions: LocaleDefinition[] = [
  { code: "sw", label: "Swahili", regions: [{ code: "sw-TZ", label: "Tanzania" }, { code: "sw-KE", label: "Kenya" }, { code: "sw-UG", label: "Uganda" }, { code: "sw-CD", label: "Congo (DRC)" }, { code: "sw-RW", label: "Rwanda" }] },
  { code: "en", label: "English", regions: [{ code: "en-US", label: "United States" }, { code: "en-GB", label: "United Kingdom" }, { code: "en-TZ", label: "Tanzania" }, { code: "en-KE", label: "Kenya" }, { code: "en-ZA", label: "South Africa" }, { code: "en-IN", label: "India" }] },
  { code: "fr", label: "French", regions: [{ code: "fr-FR", label: "France" }, { code: "fr-CA", label: "Canada" }, { code: "fr-SN", label: "Senegal" }, { code: "fr-CD", label: "Congo (DRC)" }, { code: "fr-CM", label: "Cameroon" }] },
  { code: "pt", label: "Portuguese", regions: [{ code: "pt-BR", label: "Brazil" }, { code: "pt-PT", label: "Portugal" }, { code: "pt-MZ", label: "Mozambique" }, { code: "pt-AO", label: "Angola" }] },
  { code: "ar", label: "Arabic", regions: [{ code: "ar-EG", label: "Egypt" }, { code: "ar-SA", label: "Saudi Arabia" }, { code: "ar-AE", label: "United Arab Emirates" }, { code: "ar-MA", label: "Morocco" }] },
  { code: "es", label: "Spanish", regions: [{ code: "es-ES", label: "Spain" }, { code: "es-MX", label: "Mexico" }, { code: "es-AR", label: "Argentina" }, { code: "es-CO", label: "Colombia" }] },
];

const base = (locale: string) => locale.toLowerCase().split(/[-_]/)[0];
const definitionFor = (locale: string) => localeDefinitions.find(item => item.code === base(locale));
const languageOptions = localeDefinitions.map(item => ({ value: item.code, label: item.label }));
const localeOptions = (definition: LocaleDefinition) => [
  { value: definition.code, label: `${definition.label} · General` },
  ...definition.regions.map(region => ({ value: region.code, label: `${definition.label} · ${region.label}` })),
];

export function LocaleLanguageFields({ editingLanguage, onEditingLanguageChange, onOutputLanguagesChange, outputLanguages }: { editingLanguage: string; onEditingLanguageChange: (value: string) => void; outputLanguages: string[]; onOutputLanguagesChange: (value: string[]) => void }) {
  const editingBase = editingLanguage && editingLanguage !== "auto" ? base(editingLanguage) : "auto";
  const editingDefinition = definitionFor(editingLanguage);
  const selectedBases = [...new Set(outputLanguages.map(base))];

  function toggleOutputs(nextBases: string[]) {
    onOutputLanguagesChange(nextBases.map(code => outputLanguages.find(locale => base(locale) === code) ?? code));
  }

  function updateOutput(previous: string, next: string) {
    onOutputLanguagesChange(outputLanguages.map(locale => locale === previous ? next : locale));
  }

  return <FieldGroup>
    <Field>
      <FieldLabel>Editing language</FieldLabel>
      <SearchableSelect onValueChange={value => onEditingLanguageChange(value === "auto" ? value : value)} options={[{ label: "Use detected book language", value: "auto" }, ...languageOptions]} placeholder="Search languages…" value={editingBase}/>
      <FieldDescription>The language used while reviewing and correcting the book.</FieldDescription>
    </Field>
    {editingDefinition ? <Field>
      <FieldLabel><MapPin/>Editing language type</FieldLabel>
      <SearchableSelect onValueChange={onEditingLanguageChange} options={localeOptions(editingDefinition)} placeholder={`Choose a ${editingDefinition.label} region…`} value={editingLanguage}/>
      <FieldDescription>Choose the general language or the regional form used by this book.</FieldDescription>
    </Field> : null}
    <Field>
      <FieldLabel>Additional output languages</FieldLabel>
      <ToggleGroup className="grid w-full gap-3 sm:grid-cols-3" onValueChange={toggleOutputs} type="multiple" value={selectedBases} variant="outline">
        {localeDefinitions.map(language => <ToggleGroupItem className="h-14 justify-start" key={language.code} value={language.code}><Languages/>{language.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <FieldDescription>Select languages first, then choose the appropriate regional type for each one.</FieldDescription>
    </Field>
    {outputLanguages.map(locale => {
      const definition = definitionFor(locale);
      if (!definition) return null;
      return <Field key={definition.code}>
        <FieldLabel><MapPin/>{definition.label} output type</FieldLabel>
        <SearchableSelect onValueChange={value => updateOutput(locale, value)} options={localeOptions(definition)} placeholder={`Choose a ${definition.label} region…`} value={locale}/>
      </Field>;
    })}
  </FieldGroup>;
}

export function displayLocale(locale: string) {
  const definition = definitionFor(locale);
  if (!definition) return locale;
  const region = definition.regions.find(item => item.code.toLowerCase() === locale.toLowerCase());
  return region ? `${definition.label} (${region.label})` : definition.label;
}
