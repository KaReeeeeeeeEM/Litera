"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  FileText,
  Gauge,
  KeyRound,
  Languages,
  ListChecks,
  LockKeyhole,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { useState } from "react";
import type {
  ConversionConfig,
  DeviceBook,
} from "@/components/device/device-types";
import { defaultConversionConfig } from "@/components/device/device-types";
import { loadDevicePreferences } from "@/components/device/device-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { displayLocale, LocaleLanguageFields } from "@/components/device/locale-language-fields";

const steps = [
  "Preset",
  "Scope",
  "Structure",
  "Book design",
  "Learning activities",
  "Languages",
  "Review",
] as const;
const presets = [
  { value: "textbook", label: "Textbooks & activities", description: "Structured chapters, exercises, diagrams, and complex educational layouts." },
  { value: "storybook", label: "Storybook", description: "Illustration-led pages, narrative flow, and high visual fidelity." },
  { value: "reference", label: "Reference", description: "Dense text, tables, glossaries, and technical material." },
  { value: "custom", label: "Custom", description: "Start neutral and choose every conversion behavior yourself." },
] as const;
const fontFamilies = [
  "Atkinson Hyperlegible",
  "Andika",
  "Lexend",
  "Noto Sans",
  "Noto Serif",
  "Source Sans 3",
  "Source Serif 4",
] as const;

export function ConversionSetup({
  book,
  onComplete,
  onConfigureProvider,
  providerConfigured,
}: {
  book: DeviceBook;
  onComplete: (config: ConversionConfig) => Promise<void>;
  onConfigureProvider: () => void;
  providerConfigured: boolean;
}) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<ConversionConfig>(() => {
    const value = {
      ...defaultConversionConfig,
      compactOutput: loadDevicePreferences().compactOutput,
      ...book.conversionConfig,
    };
    return value.typography === "custom" && !value.fontFamily
      ? { ...value, fontFamily: "Atkinson Hyperlegible" }
      : value;
  });
  const [pending, setPending] = useState(false);
  const initialSplitRanges = parsePageParts(config.pageParts);
  const [splitStart, setSplitStart] = useState(String(initialSplitRanges[0]?.from ?? 1));
  const [splitEnd, setSplitEnd] = useState(String(initialSplitRanges[0]?.to ?? 1));
  const [additionalSplitRanges, setAdditionalSplitRanges] = useState(
    initialSplitRanges.slice(1),
  );
  const sourcePages = Array.from(
    { length: Math.max(1, book.sourceTotalPages ?? 1) },
    (_, index) => index + 1,
  );
  const primarySplitRange = {
    from: Math.min(Number(splitStart) || 1, Number(splitEnd) || 1),
    to: Math.max(Number(splitStart) || 1, Number(splitEnd) || 1),
  };
  const splitRanges = [primarySplitRange, ...additionalSplitRanges];
  function update<K extends keyof ConversionConfig>(
    key: K,
    value: ConversionConfig[K],
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
  }
  function choosePreset(value: ConversionConfig["preset"]) {
    setConfig((current) => ({
      ...current,
      preset: value,
      ...(value === "storybook" ? { sectioningMode: "page" as const, extractExercises: false, generateAnswerSpaces: false } : {}),
      ...(value === "textbook" ? { sectioningMode: "automatic" as const, extractExercises: true, generateAnswerSpaces: true } : {}),
      ...(value === "reference" ? { sectioningMode: "chapter" as const, extractExercises: false, generateAnswerSpaces: false, compactOutput: true } : {}),
    }));
  }
  function addSplitRange() {
    const from = Number(splitStart);
    const to = Number(splitEnd);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const range = { from: Math.min(from, to), to: Math.max(from, to) };
    const nextRanges = [...additionalSplitRanges, range];
    setAdditionalSplitRanges(nextRanges);
    const next = Math.min(sourcePages.length, range.to + 1);
    setSplitStart(String(next));
    setSplitEnd(String(next));
  }
  function removeSplitRange(index: number) {
    if (index === 0) return;
    setAdditionalSplitRanges((current) =>
      current.filter((_, itemIndex) => itemIndex !== index - 1),
    );
  }
  async function complete() {
    setPending(true);
    try {
      await onComplete(
        config.scope === "split"
          ? { ...config, pageParts: collapseSetupRanges(splitRanges) }
          : config,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl studio-enter">
      <div className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary">
            <BookOpenCheck />
            Source accepted
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            How should Litera convert this book?
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {book.name} passed source validation. Choose only what matters;
            every setting can be adjusted later.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {steps.length}
        </span>
      </div>
      <nav
        aria-label="Conversion setup progress"
        className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-7"
      >
        {steps.map((label, index) => (
          <button
            className="text-left"
            key={label}
            onClick={() => index <= step && setStep(index)}
            type="button"
          >
            <span
              className={cn(
                "setup-progress-segment mb-2 block h-1.5 origin-left rounded-full",
                index <= step && "is-complete",
              )}
              style={{ backgroundColor: index <= step ? "var(--primary)" : "var(--muted)" }}
            />
            <span
              className={cn(
                "text-xs font-medium",
                index === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </nav>
      <Card className="setup-step-enter mt-7" key={step}>
        <CardHeader>
          <CardTitle>{steps[step]}</CardTitle>
          <CardDescription>
            {step === 0
              ? "Choose a starting profile. You can still change every recommendation in the following steps."
              : step === 1
              ? "Choose how much of the source should enter this conversion."
              : step === 2
                ? "Choose how Litera should identify sections and reading order."
                : step === 3
                  ? "Keep the book’s visual identity or apply a clean reading font."
                  : step === 4
                    ? "Decide how Litera should turn exercises into interactive learning."
                    : step === 5
                      ? "Choose the working language and any additional reader languages."
                      : "Confirm a storage-conscious conversion plan before inventory begins."}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-80">
          {step === 0 ? (
            <ToggleGroup className="grid w-full gap-4 md:grid-cols-2" onValueChange={(value) => value && choosePreset(value as ConversionConfig["preset"])} type="single" value={config.preset} variant="outline">
              {presets.map((preset) => <ToggleGroupItem className="h-auto min-h-40 flex-col items-start whitespace-normal p-5 text-left" key={preset.value} value={preset.value}><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpenCheck /></span><strong className="text-base">{preset.label}</strong><span className="text-sm font-normal leading-6 text-muted-foreground">{preset.description}</span><Badge variant="secondary">Recommended settings included</Badge></ToggleGroupItem>)}
            </ToggleGroup>
          ) : null}
          {step === 1 ? (
            <FieldGroup>
              <Field>
                <FieldLabel>Conversion scope</FieldLabel>
                <ToggleGroup
                  className="grid w-full gap-3 sm:grid-cols-3"
                  onValueChange={(value) =>
                    value && update("scope", value as ConversionConfig["scope"])
                  }
                  type="single"
                  value={config.scope}
                  variant="outline"
                >
                  {[
                    ["whole", "Whole book", "Convert every source page."],
                    [
                      "split",
                      "Split by chapter",
                      "Process the book in smaller chapter units.",
                    ],
                    [
                      "range",
                      "Page range",
                      "Convert only selected source pages.",
                    ],
                  ].map(([value, label, description]) => (
                    <ToggleGroupItem
                      className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-left"
                      key={value}
                      value={value}
                    >
                      <strong>{label}</strong>
                      <span className="text-xs font-normal text-muted-foreground">
                        {description}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  Litera always preserves physical source-page traceability.
                </FieldDescription>
              </Field>
              {config.scope === "range" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="page-from">Start page</FieldLabel>
                    <Input
                      id="page-from"
                      min={1}
                      onChange={(event) =>
                        update("pageFrom", event.target.value)
                      }
                      placeholder="1"
                      type="number"
                      value={config.pageFrom}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="page-to">End page</FieldLabel>
                    <Input
                      id="page-to"
                      min={1}
                      onChange={(event) => update("pageTo", event.target.value)}
                      placeholder="e.g. 48"
                      type="number"
                      value={config.pageTo}
                    />
                  </Field>
                </div>
              ) : null}
              {config.scope === "split" ? (
                <Field>
                  <FieldLabel>Parts to convert</FieldLabel>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="grid gap-2 text-sm font-medium">
                      Start page
                      <Select
                        onValueChange={(value) => {
                          setSplitStart(value);
                          const nextEnd = Number(value) > Number(splitEnd) ? value : splitEnd;
                          if (nextEnd !== splitEnd)
                            setSplitEnd(value);
                          update("pageParts", collapseSetupRanges([
                            { from: Math.min(Number(value), Number(nextEnd)), to: Math.max(Number(value), Number(nextEnd)) },
                            ...additionalSplitRanges,
                          ]));
                        }}
                        value={splitStart}
                      >
                        <SelectTrigger className="h-9 w-full pr-4">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {sourcePages.map((page) => (
                              <SelectItem key={page} value={String(page)}>
                                {page}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      End page
                      <Select
                        onValueChange={(value) => {
                          setSplitEnd(value);
                          update("pageParts", collapseSetupRanges([
                            { from: Math.min(Number(splitStart), Number(value)), to: Math.max(Number(splitStart), Number(value)) },
                            ...additionalSplitRanges,
                          ]));
                        }}
                        value={splitEnd}
                      >
                        <SelectTrigger className="h-9 w-full pr-4">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {sourcePages.map((page) => (
                              <SelectItem key={page} value={String(page)}>
                                {page}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </label>
                    <Button onClick={addSplitRange} type="button" variant="outline">
                      <Plus data-icon="inline-start" /> Add range
                    </Button>
                  </div>
                  {splitRanges.length ? (
                    <div aria-label="Selected page ranges" className="mt-3 flex flex-wrap gap-2">
                      {splitRanges.map((range, index) => (
                        <Badge className="gap-1.5 py-1.5" key={`${range.from}-${range.to}`} variant="secondary">
                          Pages {range.from}{range.to === range.from ? "" : `–${range.to}`}
                          {index > 0 ? <button aria-label={`Remove pages ${range.from} to ${range.to}`} onClick={() => removeSplitRange(index)} type="button">
                            <Trash2 className="size-3.5" />
                          </button> : null}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <FieldDescription>
                    Add as many physical page ranges as needed. Converted pages
                    receive continuous digital page numbers while retaining their
                    original source-page reference.
                  </FieldDescription>
                </Field>
              ) : null}
            </FieldGroup>
          ) : null}
          {step === 2 ? (
            <FieldGroup>
              <Field>
                <FieldLabel>Sectioning mode</FieldLabel>
                <ToggleGroup className="grid w-full gap-3 sm:grid-cols-3" onValueChange={(value) => value && update("sectioningMode", value as ConversionConfig["sectioningMode"])} type="single" value={config.sectioningMode} variant="outline">
                  <ToggleGroupItem className="h-auto min-h-28 flex-col items-start whitespace-normal p-4 text-left" value="automatic"><BrainCircuit/><strong>Smart automatic</strong><span className="text-xs font-normal text-muted-foreground">Detect chapters, page roles, reading order, media, and activities automatically.</span></ToggleGroupItem>
                  <ToggleGroupItem className="h-auto min-h-28 flex-col items-start whitespace-normal p-4 text-left" value="page"><FileText/><strong>Page by page</strong><span className="text-xs font-normal text-muted-foreground">Treat every physical page as an independent editable sectioning unit.</span></ToggleGroupItem>
                  <ToggleGroupItem className="h-auto min-h-28 flex-col items-start whitespace-normal p-4 text-left" value="chapter"><BookOpenCheck/><strong>Group by chapter</strong><span className="text-xs font-normal text-muted-foreground">Use detected chapter headings to organize pages while preserving page traceability.</span></ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>You can re-section any individual page later without rebuilding the rest of the book.</FieldDescription>
              </Field>
            </FieldGroup>
          ) : null}
          {step === 3 ? (
            <FieldGroup>
              <Field>
                <FieldLabel>Typography</FieldLabel>
                <ToggleGroup
                  className="grid w-full gap-3 sm:grid-cols-3"
                  onValueChange={(value) => {
                    if (!value) return;
                    update(
                      "typography",
                      value as ConversionConfig["typography"],
                    );
                    if (value === "custom" && !config.fontFamily)
                      update("fontFamily", "Atkinson Hyperlegible");
                  }}
                  type="single"
                  value={config.typography}
                  variant="outline"
                >
                  {[
                    [
                      "adapt",
                      "Adapt from book",
                      "Detect and preserve suitable source typography.",
                    ],
                    [
                      "system",
                      "Optimized reading font",
                      "Use Litera’s compact accessible defaults.",
                    ],
                    [
                      "custom",
                      "Choose a font",
                      "Select a specific conversion-safe font family.",
                    ],
                  ].map(([value, label, description]) => (
                    <ToggleGroupItem
                      className="h-auto min-h-24 flex-col items-start whitespace-normal p-4 text-left"
                      key={value}
                      value={value}
                    >
                      <Type />
                      <strong>{label}</strong>
                      <span className="text-xs font-normal text-muted-foreground">
                        {description}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              {config.typography === "custom" ? (
                <Field>
                  <FieldLabel htmlFor="font-family">Font family</FieldLabel>
                  <SearchableSelect onValueChange={(value) => update("fontFamily", value)} options={fontFamilies.map((font) => ({ label: font, value: font }))} placeholder="Search accessible fonts…" value={config.fontFamily || "Atkinson Hyperlegible"}/>
                  <FieldDescription>
                    Litera embeds only the required font assets in the offline
                    output.
                  </FieldDescription>
                </Field>
              ) : null}
            </FieldGroup>
          ) : null}
          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <OptionToggle
                checked={config.extractExercises}
                description="Detect printed exercises and convert them into structured activities."
                icon={ListChecks}
                label="Extract exercises"
                onChange={(value) => update("extractExercises", value)}
              />
              <OptionToggle
                checked={config.generateAnswerSpaces}
                description="Create appropriate writing, drawing, or selection areas for detected responses."
                disabled={!config.extractExercises}
                icon={FileText}
                label="Generate answer spaces"
                onChange={(value) => update("generateAnswerSpaces", value)}
              />
              <OptionToggle
                checked={config.generateQuestions}
                description="Draft contextual questions per chapter for the user to review before publishing."
                icon={BrainCircuit}
                label="Suggest AI questions"
                onChange={(value) => update("generateQuestions", value)}
              />
              <OptionToggle
                checked={config.compactOutput}
                description="Compress media, remove duplicates, and package only required offline assets."
                icon={Gauge}
                label="Optimize output size"
                onChange={(value) => update("compactOutput", value)}
              />
              {config.generateQuestions ? (
                <Field>
                  <FieldLabel htmlFor="question-count">
                    Questions per chapter
                  </FieldLabel>
                  <Input
                    id="question-count"
                    max={10}
                    min={1}
                    onChange={(event) =>
                      update("questionsPerChapter", Number(event.target.value))
                    }
                    type="number"
                    value={config.questionsPerChapter}
                  />
                  <FieldDescription>
                    Generated questions remain drafts until reviewed.
                  </FieldDescription>
                </Field>
              ) : null}
            </div>
          ) : null}
          {step === 5 ? <LocaleLanguageFields editingLanguage={config.editingLanguage || "auto"} onEditingLanguageChange={value => update("editingLanguage", value)} onOutputLanguagesChange={value => update("outputLanguages", value)} outputLanguages={config.outputLanguages}/> : null}
          {step === 6 ? (
            <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 [&>*:last-child:nth-child(odd)]:sm:col-span-2">
              <Summary icon={BookOpenCheck} label="Preset" value={presets.find((preset) => preset.value === config.preset)?.label ?? "Custom"}/>
              <Summary
                icon={Languages}
                label="Scope"
                value={
                  config.scope === "whole"
                    ? "Whole book"
                    : config.scope === "split"
                      ? "Split by chapter"
                      : `Pages ${config.pageFrom}–${config.pageTo || "end"}`
                }
              />
              <Summary
                icon={Type}
                label="Typography"
                value={
                  config.typography === "adapt"
                    ? "Adapt from source"
                    : config.typography === "system"
                      ? "Optimized reading font"
                      : config.fontFamily || "Custom font"
                }
              />
              <Summary
                icon={BookOpenCheck}
                label="Sectioning"
                value={config.sectioningMode === "automatic" ? "Smart automatic" : config.sectioningMode === "page" ? "Page by page" : "Grouped by chapter"}
              />
              <Summary
                icon={ListChecks}
                label="Activities"
                value={
                  config.extractExercises
                    ? config.generateAnswerSpaces
                      ? "Extract with answer spaces"
                      : "Extract exercises"
                    : "Preserve as content"
                }
              />
              <Summary
                icon={BrainCircuit}
                label="AI questions"
                value={
                  config.generateQuestions
                    ? `${config.questionsPerChapter} drafts per chapter`
                    : "Off"
                }
              />
              <Summary
                icon={Gauge}
                label="Output"
                value={
                  config.compactOutput
                    ? "Compact offline package"
                    : "Original-quality assets"
                }
              />
              <Summary icon={Languages} label="Languages" value={`${config.editingLanguage && config.editingLanguage !== "auto" ? displayLocale(config.editingLanguage) : "Detected source"}${config.outputLanguages.length ? ` + ${config.outputLanguages.length} output` : ""}`}/>
            </div>
              {!providerConfigured ? (
                <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 text-primary" />
                    <div>
                      <strong className="text-sm">AI stages need a provider</strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        You can extract the source now. Configure a provider before Storyboard, Language, or Speech.
                      </p>
                    </div>
                  </div>
                  <Button onClick={onConfigureProvider} size="sm">
                    <KeyRound data-icon="inline-start" />
                    Configure provider
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
        <div className="flex items-center justify-between border-t p-5">
          <Button
            disabled={step === 0}
            onClick={() => setStep((current) => current - 1)}
            variant="ghost"
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((current) => current + 1)}>
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              disabled={pending}
              onClick={() => void complete()}
            >
              <Check data-icon="inline-start" />
              {pending ? "Preparing…" : "Start source inventory"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function parsePageParts(value: string) {
  return value.split(",").flatMap((token) => {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return [];
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    return [{ from: Math.min(first, last), to: Math.max(first, last) }];
  });
}

function collapseSetupRanges(ranges: Array<{ from: number; to: number }>) {
  const pages = ranges.flatMap(({ from, to }) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index),
  );
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  const result: string[] = [];
  let start = sorted[0]!;
  let previous = start;
  for (const page of sorted.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    result.push(start === previous ? String(start) : `${start}-${previous}`);
    start = previous = page;
  }
  result.push(start === previous ? String(start) : `${start}-${previous}`);
  return result.join(", ");
}

function OptionToggle({
  checked,
  description,
  disabled,
  icon: Icon,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon: typeof ListChecks;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <Toggle
      aria-label={label}
      className="h-auto min-h-32 w-full items-start justify-start whitespace-normal p-5 text-left"
      disabled={disabled}
      onPressedChange={onChange}
      pressed={checked}
      variant="outline"
    >
      <Icon className="mt-0.5 text-primary" />
      <span>
        <strong className="flex items-center gap-2">
          {label}
          {checked ? <Check className="text-primary" /> : null}
        </strong>
        <span className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Toggle>
  );
}
function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Languages;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
      <Icon className="mt-0.5 text-primary" />
      <div>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="mt-1 block text-sm">{value}</strong>
      </div>
    </div>
  );
}
