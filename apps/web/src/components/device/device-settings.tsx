"use client";

import { ArrowLeft, BellRing, Check, Database, Eye, KeyRound, Loader2, Palette, Play, Settings2, Speech, Square, Type } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDeviceManagedProviderKeys, type ProviderId, type ProviderStatus } from "@/components/device/provider-vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { synthesizeCatalogEntry } from "@/lib/device-pipeline/speech-engine";
import { toast } from "@/lib/feedback";

type ColorVision = "standard" | "protanopia" | "deuteranopia" | "tritanopia" | "monochrome" | "inverted";
type CursorStyle = "system" | "canva" | "circle";
type Preferences = { primary: string; scale: "compact" | "comfortable" | "large"; sounds: boolean; compactOutput: boolean; colorVision: ColorVision; cursorStyle: CursorStyle };
export type ProviderRouting = { prompts: ProviderId | ""; vision: ProviderId | ""; translation: ProviderId | ""; speech: ProviderId | ""; voice: string; speed: string };
const preferencesKey = "litera-device-preferences-v1";
const routingKey = "litera-provider-routing-v1";
const defaults: Preferences = { primary: "#DF301C", scale: "comfortable", sounds: true, compactOutput: true, colorVision: "standard", cursorStyle: "canva" };
const routingDefaults: ProviderRouting = { prompts: "", vision: "", translation: "", speech: "", voice: "alloy", speed: "1" };
const colors = [{ name: "Litera red", value: "#DF301C" }, { name: "Coral", value: "#C2413A" }, { name: "Rose", value: "#BE3455" }, { name: "Magenta", value: "#A83279" }, { name: "Violet", value: "#7138A8" }, { name: "Indigo", value: "#4F46A5" }, { name: "Ocean", value: "#1E63A6" }, { name: "Cyan", value: "#087C87" }, { name: "Teal", value: "#0F766E" }, { name: "Forest", value: "#397047" }];
const providerLabels: Record<ProviderId, string> = { openai: "OpenAI", gemini: "Gemini", anthropic: "Anthropic", azure: "Azure OpenAI", custom: "Custom provider" };
const colorVisionOptions = [{ value: "standard", label: "Standard colors" }, { value: "protanopia", label: "Red-weak support" }, { value: "deuteranopia", label: "Green-weak support" }, { value: "tritanopia", label: "Blue-yellow support" }, { value: "monochrome", label: "Monochrome high contrast" }, { value: "inverted", label: "Invert interface colors" }];

export function loadDevicePreferences(): Preferences { if (typeof window === "undefined") return defaults; try { return { ...defaults, ...JSON.parse(localStorage.getItem(preferencesKey) ?? "{}") as Partial<Preferences> }; } catch { return defaults; } }
export function loadProviderRouting(): ProviderRouting { if (typeof window === "undefined") return routingDefaults; try { return { ...routingDefaults, ...JSON.parse(localStorage.getItem(routingKey) ?? "{}") as Partial<ProviderRouting> }; } catch { return routingDefaults; } }
export function applyDevicePreferences(value: Preferences) { const root = document.documentElement; root.style.setProperty("--primary", value.primary); root.style.setProperty("--ring", value.primary); root.style.setProperty("--sidebar-primary", value.primary); root.style.fontSize = value.scale === "compact" ? "15px" : value.scale === "large" ? "18px" : "16px"; root.dataset.colorVision = value.colorVision; root.dataset.cursorStyle = value.cursorStyle; localStorage.setItem("litera-feedback-sounds", value.sounds ? "on" : "off"); }

export function DeviceSettingsPage({ onBack, onConfigureProviders, providerStatus }: { onBack: () => void; onConfigureProviders: () => void; providerStatus: ProviderStatus }) {
  const { setTheme, theme } = useTheme();
  const [section, setSection] = useState("appearance");
  const [preferences, setPreferences] = useState<Preferences>(loadDevicePreferences);
  const [routing, setRouting] = useState<ProviderRouting>(loadProviderRouting);
  const [exiting, setExiting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const previewAudio = useRef<HTMLAudioElement | undefined>(undefined);
  const previewController = useRef<AbortController | undefined>(undefined);
  const configuredProviders = useMemo(() => (Object.entries(providerStatus.providers) as Array<[ProviderId, boolean]>).filter(([, configured]) => configured).map(([id]) => id), [providerStatus]);
  useEffect(() => {
    if (configuredProviders.length !== 1) return;
    const [onlyProvider] = configuredProviders;
    const timeout = window.setTimeout(() => {
      setRouting(current => {
        const compatibleSpeech = onlyProvider !== "anthropic";
        const next = {
          ...current,
          prompts: configuredProviders.includes(current.prompts as ProviderId) ? current.prompts : onlyProvider,
          vision: configuredProviders.includes(current.vision as ProviderId) ? current.vision : onlyProvider,
          translation: configuredProviders.includes(current.translation as ProviderId) ? current.translation : onlyProvider,
          speech: compatibleSpeech && !configuredProviders.includes(current.speech as ProviderId) ? onlyProvider : current.speech,
        };
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [configuredProviders]);
  useEffect(() => { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); applyDevicePreferences(preferences); }, [preferences]);
  useEffect(() => { localStorage.setItem(routingKey, JSON.stringify(routing)); }, [routing]);
  useEffect(() => () => stopVoicePreview(), []);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) { setPreferences(current => ({ ...current, [key]: value })); }
  function stopVoicePreview() {
    previewController.current?.abort();
    previewController.current = undefined;
    if (previewAudio.current) {
      previewAudio.current.pause();
      URL.revokeObjectURL(previewAudio.current.src);
      previewAudio.current = undefined;
    }
    setPreviewing(false);
  }
  async function playVoicePreview() {
    if (previewing) { stopVoicePreview(); return; }
    if (routing.speech !== "openai" && routing.speech !== "gemini") { toast.error("Choose OpenAI or Gemini for speech before previewing a voice."); return; }
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewing(true);
    try {
      const keys = await loadDeviceManagedProviderKeys();
      if (!keys) throw new Error("Configure or unlock your speech provider first.");
      const sample = await synthesizeCatalogEntry({ entry: { id: "voice-preview", pageNumber: 1, text: "Welcome to Litera. This is a preview of your selected narration voice." }, language: "en", provider: routing.speech, keys, voice: routing.voice, speed: Number(routing.speed) || 1, signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(sample.audio);
      const audio = new Audio(url);
      previewAudio.current = audio;
      audio.onended = stopVoicePreview;
      audio.onerror = () => { stopVoicePreview(); toast.error("The voice preview could not be played."); };
      await audio.play();
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "The voice preview could not be generated.");
      stopVoicePreview();
    }
  }
  function leave() { setExiting(true); window.setTimeout(onBack, 400); }
  const sections = [{ id: "appearance", label: "Appearance", icon: Palette }, { id: "providers", label: "AI providers", icon: KeyRound }, { id: "voice", label: "Voice defaults", icon: Speech }, { id: "feedback", label: "Feedback & access", icon: BellRing }, { id: "storage", label: "Storage & preview", icon: Database }];
  return <section className="page-transition min-h-[calc(100vh-4rem)] bg-background" data-exiting={exiting}><div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[16rem_1fr]"><aside className="border-r bg-muted/20 p-5"><Button onClick={leave} variant="ghost"><ArrowLeft data-icon="inline-start"/>Back to workspace</Button><nav className="mt-8 grid gap-1">{sections.map(item => <button className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-400 hover:bg-primary/10", section === item.id && "bg-primary/10 font-medium")} key={item.id} onClick={() => setSection(item.id)} type="button"><item.icon className="size-4 text-primary"/>{item.label}{item.id === "providers" && providerStatus.configured ? <Check className="ml-auto size-4 text-primary"/> : null}</button>)}</nav></aside><div className="p-5 md:p-8 lg:p-12"><div className="mx-auto max-w-4xl"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Settings2/></span><div><h1 className="text-3xl font-semibold tracking-tight">{sections.find(item => item.id === section)?.label}</h1><p className="mt-1 text-sm text-muted-foreground">Personalize Litera on this device.</p></div></div>
    {section === "appearance" ? <div className="mt-8 grid gap-5"><Card><CardHeader><CardTitle>Color theme</CardTitle><CardDescription>Choose how application surfaces respond to your environment.</CardDescription></CardHeader><CardContent><ToggleGroup onValueChange={value => value && setTheme(value)} type="single" value={theme} variant="outline"><ToggleGroupItem value="light">Light</ToggleGroupItem><ToggleGroupItem value="dark">Dark</ToggleGroupItem><ToggleGroupItem value="system">System</ToggleGroupItem></ToggleGroup></CardContent></Card><Card><CardHeader><CardTitle>Primary color</CardTitle><CardDescription>Choose from a broader palette for actions, focus, progress, and selected controls.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-3">{colors.map(color => <button aria-label={color.name} className={cn("grid size-12 place-items-center rounded-full border-4 border-background shadow-sm ring-offset-2 transition-transform duration-400 hover:scale-105", preferences.primary === color.value && "ring-2 ring-foreground/30")} key={color.value} onClick={() => update("primary", color.value)} style={{ backgroundColor: color.value }} type="button">{preferences.primary === color.value ? <Check className="text-white"/> : null}</button>)}</div></CardContent></Card><Card><CardHeader><CardTitle>Cursor style</CardTitle><CardDescription>Use your operating-system pointer or a Litera pointer that follows the selected primary color.</CardDescription></CardHeader><CardContent><ToggleGroup aria-label="Cursor style" onValueChange={value => value && update("cursorStyle", value as CursorStyle)} type="single" value={preferences.cursorStyle} variant="outline"><ToggleGroupItem value="system">System</ToggleGroupItem><ToggleGroupItem value="canva">Soft pointer</ToggleGroupItem><ToggleGroupItem value="circle">Circle</ToggleGroupItem></ToggleGroup></CardContent></Card><Card><CardHeader><CardTitle>Color vision support</CardTitle><CardDescription>Adapt contrast and color relationships. Stage labels and icons remain available so meaning never depends on color alone.</CardDescription></CardHeader><CardContent><SearchableSelect className="max-w-sm" onValueChange={value => update("colorVision", value as ColorVision)} options={colorVisionOptions} placeholder="Search color modes…" value={preferences.colorVision}/></CardContent></Card><Card><CardHeader><CardTitle>Interface size</CardTitle></CardHeader><CardContent><ToggleGroup onValueChange={value => value && update("scale", value as Preferences["scale"])} type="single" value={preferences.scale} variant="outline"><ToggleGroupItem value="compact">Compact</ToggleGroupItem><ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem><ToggleGroupItem value="large">Large</ToggleGroupItem></ToggleGroup></CardContent></Card></div> : null}
    {section === "providers" ? <div className="mt-8 grid gap-5"><Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Provider credentials</CardTitle><CardDescription className="mt-2">Configure each provider in a dedicated tab inside the encrypted vault.</CardDescription></div><Badge variant={providerStatus.configured ? "secondary" : "outline"}>{providerStatus.configured ? "Configured" : "Required"}</Badge></div></CardHeader><CardContent><Button onClick={onConfigureProviders}><KeyRound data-icon="inline-start"/>{providerStatus.configured ? "Manage API keys" : "Configure API keys"}</Button></CardContent></Card><Card><CardHeader><CardTitle>Pipeline assignments</CardTitle><CardDescription>Choose which configured provider Litera uses for each kind of work. A sole compatible provider is selected automatically.</CardDescription></CardHeader><CardContent className="flex flex-col gap-0"><RoutingSelect label="AI prompts and rewriting" options={configuredProviders} value={routing.prompts} onChange={value => setRouting(current => ({ ...current, prompts: value }))}/><RoutingSelect label="Vision and source analysis" options={configuredProviders} value={routing.vision} onChange={value => setRouting(current => ({ ...current, vision: value }))}/><RoutingSelect label="Translation and localization" options={configuredProviders} value={routing.translation} onChange={value => setRouting(current => ({ ...current, translation: value }))}/><RoutingSelect label="Speech and narration" options={configuredProviders.filter(id => id !== "anthropic")} value={routing.speech} onChange={value => setRouting(current => ({ ...current, speech: value }))}/></CardContent></Card></div> : null}
    {section === "voice" ? <Card className="mt-8"><CardHeader><CardTitle>Generated audio defaults</CardTitle><CardDescription>Set the voice and reading speed used for new narration. Every book can override these later.</CardDescription></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label>Default voice</Label><SearchableSelect onValueChange={voice => { stopVoicePreview(); setRouting(current => ({ ...current, voice })); }} options={voiceOptions(routing.speech).map((voice) => ({ label: voice, value: voice }))} placeholder="Search voices…" value={routing.voice}/></div><div className="grid gap-2"><Label>Default speed</Label><SearchableSelect onValueChange={speed => { stopVoicePreview(); setRouting(current => ({ ...current, speed })); }} options={["0.75", "0.9", "1", "1.1", "1.25", "1.5"].map((speed) => ({ label: `${speed}×`, value: speed }))} placeholder="Search speeds…" value={routing.speed}/></div></div><div className="mt-5 flex items-center gap-3 border-t pt-5"><Button aria-label={previewing ? "Stop voice preview" : "Play voice preview"} onClick={() => void playVoicePreview()} type="button" variant="outline">{previewing ? <Square data-icon="inline-start"/> : <Play data-icon="inline-start"/>}{previewing ? "Stop preview" : "Play voice preview"}</Button>{previewing ? <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Generating or playing sample…</span> : <span className="text-sm text-muted-foreground">Hear {routing.voice} at {routing.speed}× speed.</span>}</div></CardContent></Card> : null}
    {section === "feedback" ? <div className="mt-8 grid gap-5"><PreferenceCard checked={preferences.sounds} description="Play subtle cues for success, completion, warnings, and errors." icon={BellRing} label="Feedback sounds" onChange={value => update("sounds", value)}/><Card><CardHeader><CardTitle>Accessible motion</CardTitle><CardDescription>Page and component changes use a smooth 400 ms fade. Litera disables non-essential motion when your operating system requests reduced motion.</CardDescription></CardHeader></Card></div> : null}
    {section === "storage" ? <div className="mt-8 grid gap-5"><PreferenceCard checked={preferences.compactOutput} description="Default new conversions to deduplicated assets and compressed media." icon={Database} label="Prefer compact output" onChange={value => update("compactOutput", value)}/></div> : null}
  </div></div></div></section>;
}

function RoutingSelect({ label, onChange, options, value }: { label: string; onChange: (value: ProviderId) => void; options: ProviderId[]; value: ProviderId | "" }) { const selected = options.includes(value as ProviderId) ? value : undefined; return <div className="flex flex-col gap-3 border-b py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><Label className="text-base">{label}</Label>{options.length > 3 ? <SearchableSelect className="sm:w-64" disabled={!options.length} onValueChange={next => onChange(next as ProviderId)} options={options.map((id) => ({ label: providerLabels[id], value: id }))} placeholder="Search providers…" value={selected}/> : <Select disabled={!options.length} onValueChange={value => onChange(value as ProviderId)} value={selected}><SelectTrigger className="w-full sm:w-64"><SelectValue placeholder={options.length ? "Select provider" : "Configure a compatible provider first"}/></SelectTrigger><SelectContent><SelectGroup>{options.map(id => <SelectItem key={id} value={id}>{providerLabels[id]}</SelectItem>)}</SelectGroup></SelectContent></Select>}</div>; }
function voiceOptions(provider: ProviderId | "") { return provider === "gemini" ? ["Kore", "Puck", "Aoede", "Charon", "Fenrir"] : provider === "custom" ? ["Provider default"] : ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]; }
function PreferenceCard({ checked, description, icon: Icon, label, onChange }: { checked: boolean; description: string; icon: typeof Type | typeof Eye; label: string; onChange: (value: boolean) => void }) { return <Card><CardHeader><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon/></span><div><CardTitle>{label}</CardTitle><CardDescription className="mt-2">{description}</CardDescription></div></div><Toggle aria-label={label} onPressedChange={onChange} pressed={checked} variant="outline">{checked ? "On" : "Off"}</Toggle></div></CardHeader></Card>; }
