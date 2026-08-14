"use client";

import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readSetting, writeSetting } from "@/components/device/device-storage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ProviderKeys = { openai: string; gemini: string; anthropic: string; custom: string };
type VaultRecord = { salt: number[]; iv: number[]; ciphertext: number[] };
const vaultKey = "provider-vault-v1";
const emptyKeys: ProviderKeys = { openai: "", gemini: "", anthropic: "", custom: "" };

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 250_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptKeys(keys: ProviderKeys, password: string): Promise<VaultRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(keys)));
  return { salt: Array.from(salt), iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptKeys(record: VaultRecord, password: string): Promise<ProviderKeys> {
  const salt = new Uint8Array(record.salt);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, new Uint8Array(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as ProviderKeys;
}

export function ProviderVault({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [record, setRecord] = useState<VaultRecord>();
  const [password, setPassword] = useState("");
  const [keys, setKeys] = useState<ProviderKeys>(emptyKeys);
  const [unlocked, setUnlocked] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { if (!open) return; void readSetting<VaultRecord>(vaultKey).then(setRecord); }, [open]);

  async function unlock() {
    if (password.length < 12) { toast.error("Use a vault password with at least 12 characters."); return; }
    if (!record) { setUnlocked(true); return; }
    setPending(true);
    try { setKeys(await decryptKeys(record, password)); setUnlocked(true); toast.success("Provider vault unlocked for this session."); }
    catch { toast.error("That vault password could not unlock the provider keys."); }
    finally { setPending(false); }
  }

  async function save() {
    setPending(true);
    try { const next = await encryptKeys(keys, password); await writeSetting(vaultKey, next); setRecord(next); setPassword(""); setKeys(emptyKeys); setUnlocked(false); onOpenChange(false); toast.success("Provider keys encrypted on this device."); }
    catch { toast.error("Litera could not save the encrypted provider vault."); }
    finally { setPending(false); }
  }

  function update(provider: keyof ProviderKeys, value: string) { setKeys(current => ({ ...current, [provider]: value })); }
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound/>AI provider vault</DialogTitle><DialogDescription>Configure your own providers. Litera encrypts these values locally; it never synchronizes them to an account.</DialogDescription></DialogHeader><Alert><ShieldCheck/><AlertTitle>Encrypted at rest</AlertTitle><AlertDescription>Your vault password derives the encryption key and is kept only in memory while this dialog is unlocked. If you forget it, the stored provider keys cannot be recovered.</AlertDescription></Alert>{!unlocked ? <FieldGroup><Field><FieldLabel htmlFor="vault-password">Vault password</FieldLabel><Input autoComplete="current-password" id="vault-password" minLength={12} onChange={event => setPassword(event.target.value)} placeholder={record ? "Enter your vault password" : "Create at least 12 characters"} type="password" value={password}/><FieldDescription>{record ? "Unlock the existing local vault." : "Create a new password for this device."}</FieldDescription></Field><Button disabled={pending} onClick={() => void unlock()}>{pending ? <Loader2 className="animate-spin" data-icon="inline-start"/> : <LockKeyhole data-icon="inline-start"/>}{record ? "Unlock vault" : "Create vault"}</Button></FieldGroup> : <FieldGroup>{([['openai','OpenAI','sk-…'],['gemini','Google Gemini','AIza…'],['anthropic','Anthropic','sk-ant-…'],['custom','Custom OpenAI-compatible provider','Provider API key']] as const).map(([provider,label,placeholder]) => <Field key={provider}><FieldLabel htmlFor={`provider-${provider}`}>{label}</FieldLabel><Input autoComplete="off" id={`provider-${provider}`} onChange={event => update(provider,event.target.value)} placeholder={placeholder} type="password" value={keys[provider]}/></Field>)}</FieldGroup>}<DialogFooter>{unlocked ? <Button disabled={pending} onClick={() => void save()}>{pending ? <Loader2 className="animate-spin" data-icon="inline-start"/> : <ShieldCheck data-icon="inline-start"/>}Encrypt and save</Button> : null}</DialogFooter></DialogContent></Dialog>;
}
