"use client";

import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/feedback";
import { readSetting, writeSetting } from "@/components/device/device-storage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ProviderKeys = { openai: string; gemini: string; anthropic: string; azure: string; azureEndpoint: string; azureDeployment: string; custom: string; customEndpoint: string };
type LegacyVaultRecord = { salt: number[]; iv: number[]; ciphertext: number[] };
type DeviceVaultRecord = { version: 2; iv: number[]; ciphertext: number[] };
type VaultRecord = LegacyVaultRecord | DeviceVaultRecord;
export type ProviderId = "openai" | "anthropic" | "gemini" | "azure" | "custom";
export type ProviderStatus = { configured: boolean; providers: Record<ProviderId, boolean> };
export const emptyProviderStatus: ProviderStatus = { configured: false, providers: { openai: false, anthropic: false, gemini: false, azure: false, custom: false } };
const vaultKey = "provider-vault-v1";
const deviceKeyKey = "provider-vault-device-key-v1";
const emptyKeys: ProviderKeys = { openai: "", gemini: "", anthropic: "", azure: "", azureEndpoint: "", azureDeployment: "", custom: "", customEndpoint: "" };
export const providerStatusKey = "provider-status-v1";

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 250_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptKeys(keys: ProviderKeys, password: string): Promise<LegacyVaultRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(keys)));
  return { salt: Array.from(salt), iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptKeys(record: LegacyVaultRecord, password: string): Promise<ProviderKeys> {
  const key = await deriveKey(password, new Uint8Array(record.salt));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.ciphertext));
  return { ...emptyKeys, ...JSON.parse(new TextDecoder().decode(plaintext)) as Partial<ProviderKeys> };
}

function isDeviceVault(record: VaultRecord): record is DeviceVaultRecord {
  return "version" in record && record.version === 2;
}

async function deviceEncryptionKey() {
  const stored = await readSetting<CryptoKey>(deviceKeyKey);
  if (stored) return stored;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await writeSetting(deviceKeyKey, key);
  return key;
}

export async function saveDeviceManagedProviderKeys(keys: ProviderKeys) {
  const key = await deviceEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(keys)));
  const record: DeviceVaultRecord = { version: 2, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
  const providers = { openai: Boolean(keys.openai), anthropic: Boolean(keys.anthropic), gemini: Boolean(keys.gemini), azure: Boolean(keys.azure), custom: Boolean(keys.custom) };
  const status: ProviderStatus = { configured: Object.values(providers).some(Boolean), providers };
  await writeSetting(vaultKey, record);
  await writeSetting(providerStatusKey, status);
  return status;
}

export async function loadDeviceManagedProviderKeys() {
  const record = await readSetting<VaultRecord>(vaultKey);
  if (!record || !isDeviceVault(record)) return undefined;
  const key = await readSetting<CryptoKey>(deviceKeyKey);
  if (!key) return undefined;
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.ciphertext));
  return { ...emptyKeys, ...JSON.parse(new TextDecoder().decode(plaintext)) as Partial<ProviderKeys> };
}

export function ProviderVault({ open, onOpenChange, onSaved, onUnlocked }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved?: (status: ProviderStatus, keys: ProviderKeys) => void; onUnlocked?: (keys: ProviderKeys) => void }) {
  const [record, setRecord] = useState<VaultRecord>();
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [keys, setKeys] = useState<ProviderKeys>(emptyKeys);
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const editable = loaded && (!record || isDeviceVault(record) || unlocked);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    void readSetting<VaultRecord>(vaultKey).then(async value => {
      setPassword("");
      setUnlocked(false);
      setRecord(value);
      if (value && isDeviceVault(value)) {
        const restored = await loadDeviceManagedProviderKeys();
        if (restored) { setKeys(restored); setUnlocked(true); onUnlocked?.(restored); }
      } else setKeys(emptyKeys);
      setLoaded(true);
    });
  }, [open]);

  async function unlock() {
    if (password.length < 12) return toast.error("Use a vault password with at least 12 characters.");
    if (!record) return;
    setPending(true);
    if (isDeviceVault(record)) return;
    try {
      const unlockedKeys = await decryptKeys(record, password);
      await saveDeviceManagedProviderKeys(unlockedKeys);
      setKeys(unlockedKeys); setUnlocked(true); setRecord(await readSetting<VaultRecord>(vaultKey)); onUnlocked?.(unlockedKeys);
      toast.success("Provider keys migrated to automatic device encryption. No future unlock is required.");
    }
    catch { toast.error("That vault password could not unlock the provider keys."); }
    finally { setPending(false); }
  }

  async function save() {
    setPending(true);
    try {
      const status = await saveDeviceManagedProviderKeys(keys);
      setRecord(await readSetting<VaultRecord>(vaultKey)); setPassword(""); setUnlocked(true); onSaved?.(status, keys); onOpenChange(false);
      toast.success("Provider keys encrypted and available automatically on this device.");
    } catch { toast.error("Litera could not save the encrypted provider vault."); }
    finally { setPending(false); }
  }

  function update(provider: keyof ProviderKeys, value: string) { setKeys(current => ({ ...current, [provider]: value })); }

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="sm:!max-w-4xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound/>Pipeline API providers</DialogTitle><DialogDescription>Select a provider tab, paste its credentials, then save the encrypted vault. Keys never leave this device except when sent directly to the selected provider.</DialogDescription></DialogHeader>
    <Tabs defaultValue="openai"><TabsList className="grid h-auto w-full grid-cols-3 sm:grid-cols-5" variant="line"><TabsTrigger value="openai">OpenAI</TabsTrigger><TabsTrigger value="gemini">Gemini</TabsTrigger><TabsTrigger value="anthropic">Anthropic</TabsTrigger><TabsTrigger value="azure">Azure</TabsTrigger><TabsTrigger value="custom">Custom</TabsTrigger></TabsList>
      <fieldset className="min-h-44" disabled={!editable}><ProviderTab description="Prompts, translation, vision, and speech-capable tasks." id="openai" label="OpenAI API key" onChange={value => update("openai", value)} placeholder="sk-…" value={keys.openai}/><ProviderTab description="Multimodal understanding, localization, generation, and speech." id="gemini" label="Google Gemini API key" onChange={value => update("gemini", value)} placeholder="AIza…" value={keys.gemini}/><ProviderTab description="Long-context review, structured rewriting, and accessible content refinement." id="anthropic" label="Anthropic API key" onChange={value => update("anthropic", value)} placeholder="sk-ant-…" value={keys.anthropic}/>
        <TabsContent className="pt-5" value="azure"><FieldGroup><Field><FieldLabel htmlFor="provider-azure-endpoint">Azure endpoint</FieldLabel><Input id="provider-azure-endpoint" onChange={event => update("azureEndpoint", event.target.value)} placeholder="https://your-resource.openai.azure.com" type="url" value={keys.azureEndpoint}/></Field><Field><FieldLabel htmlFor="provider-azure-deployment">Deployment name</FieldLabel><Input id="provider-azure-deployment" onChange={event => update("azureDeployment", event.target.value)} placeholder="e.g. litera-gpt" value={keys.azureDeployment}/></Field><Field><FieldLabel htmlFor="provider-azure">Azure API key</FieldLabel><Input id="provider-azure" onChange={event => update("azure", event.target.value)} placeholder="Paste Azure API key" type="password" value={keys.azure}/></Field></FieldGroup></TabsContent>
        <TabsContent className="pt-5" value="custom"><FieldGroup><Field><FieldLabel htmlFor="provider-custom-endpoint">Compatible API endpoint</FieldLabel><Input id="provider-custom-endpoint" onChange={event => update("customEndpoint", event.target.value)} placeholder="https://api.example.com/v1" type="url" value={keys.customEndpoint}/></Field><Field><FieldLabel htmlFor="provider-custom">API key</FieldLabel><Input id="provider-custom" onChange={event => update("custom", event.target.value)} placeholder="Paste provider API key" type="password" value={keys.custom}/></Field></FieldGroup></TabsContent>
      </fieldset></Tabs>
    <Alert><ShieldCheck/><AlertTitle>{record && !isDeviceVault(record) && !unlocked ? "One-time migration" : "Encrypted on this device"}</AlertTitle><AlertDescription>{record && !isDeviceVault(record) && !unlocked ? "Enter the old vault password once. Litera will migrate these keys and will not lock them again." : "Litera encrypts these credentials locally and restores them automatically when the app opens. They are never synchronized."}</AlertDescription></Alert>
    {record && !isDeviceVault(record) && !unlocked ? <Field><FieldLabel htmlFor="vault-password">Previous vault password</FieldLabel><Input autoComplete="current-password" id="vault-password" minLength={12} onChange={event => setPassword(event.target.value)} placeholder="Enter at least 12 characters" type="password" value={password}/></Field> : null}
    <DialogFooter>{record && !isDeviceVault(record) && !unlocked ? <Button disabled={pending || !loaded} onClick={() => void unlock()}><LockKeyhole data-icon="inline-start"/>{pending ? "Migrating…" : "Migrate encrypted keys"}</Button> : <Button disabled={pending || !loaded} onClick={() => void save()}>{pending ? <Loader2 className="animate-spin" data-icon="inline-start"/> : <ShieldCheck data-icon="inline-start"/>}{pending ? "Saving…" : "Save encrypted providers"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

function ProviderTab({ description, id, label, onChange, placeholder, value }: { description: string; id: "openai" | "anthropic" | "gemini"; label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return <TabsContent className="pt-5" value={id}><FieldGroup><Field><FieldLabel htmlFor={`provider-${id}`}>{label}</FieldLabel><Input autoComplete="off" id={`provider-${id}`} onChange={event => onChange(event.target.value)} placeholder={placeholder} spellCheck={false} type="password" value={value}/><FieldDescription>{description}</FieldDescription></Field></FieldGroup></TabsContent>;
}
