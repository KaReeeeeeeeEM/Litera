"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Fingerprint, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthMode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [pending, setPending] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function submit(formData: FormData) {
    setPending(true); setMessage(null);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const result = mode === "sign-up" ? await authClient.signUp.email({ name, email, password, callbackURL: "/workspace" }) : await authClient.signIn.email({ email, password, callbackURL: "/workspace" });
    setPending(false);
    if (result.error) { setMessage({ type: "error", text: result.error.message ?? "We could not complete that request. Try again." }); return; }
    if (mode === "sign-up") { setMessage({ type: "success", text: "Account created. Check your email to verify your address before signing in." }); return; }
    router.push("/workspace"); router.refresh();
  }

  async function signInWithPasskey() {
    if (!("PublicKeyCredential" in window)) { setMessage({ type: "error", text: "This browser or device does not support passkeys." }); return; }
    setPasskeyPending(true); setMessage(null);
    const result = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (result?.error) { setMessage({ type: "error", text: result.error.message ?? "Passkey sign-in was not completed." }); return; }
    router.push("/workspace"); router.refresh();
  }

  return <Tabs onValueChange={(value) => { setMode(value as AuthMode); setMessage(null); }} value={mode}>
    <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sign-in">Sign in</TabsTrigger><TabsTrigger value="sign-up">Create account</TabsTrigger></TabsList>
    {(["sign-in","sign-up"] as AuthMode[]).map((tab)=><TabsContent className="pt-6" key={tab} value={tab}><form action={submit}><FieldGroup>
      {tab === "sign-up" ? <Field><FieldLabel htmlFor="name">Full name</FieldLabel><Input autoComplete="name" id="name" name="name" placeholder="Amina Mushi" required /></Field> : null}
      <Field><FieldLabel htmlFor={`${tab}-email`}>Email address</FieldLabel><Input autoComplete={tab === "sign-in" ? "username webauthn" : "email"} id={`${tab}-email`} name="email" placeholder="you@example.com" required type="email" /></Field>
      <Field><div className="flex items-center justify-between gap-4"><FieldLabel htmlFor={`${tab}-password`}>Password</FieldLabel>{tab === "sign-in" ? <Link className="text-xs font-medium text-primary hover:underline" href="/forgot-password">Forgot password?</Link> : null}</div><Input autoComplete={tab === "sign-up" ? "new-password" : "current-password webauthn"} id={`${tab}-password`} minLength={12} name="password" placeholder={tab === "sign-up" ? "Create at least 12 characters" : "Enter your password"} required type="password" /><FieldDescription>Use at least 12 characters.</FieldDescription></Field>
      {message ? <Alert variant={message.type === "error" ? "destructive" : "default"}>{message.type === "error" ? <AlertCircle /> : <CheckCircle2 />}<AlertTitle>{message.type === "error" ? "Unable to continue" : "Check your email"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
      <FieldError/><Button disabled={pending} size="lg" type="submit">{pending ? <Loader2 className="animate-spin" data-icon="inline-start"/> : null}{tab === "sign-up" ? "Create member account" : "Sign in"}<ArrowRight data-icon="inline-end"/></Button>
      {tab === "sign-in" ? <><div className="flex items-center gap-3"><Separator className="flex-1"/><span className="text-xs text-muted-foreground">or</span><Separator className="flex-1"/></div><Button disabled={passkeyPending} onClick={signInWithPasskey} size="lg" type="button" variant="outline">{passkeyPending ? <Loader2 className="animate-spin" data-icon="inline-start"/> : <Fingerprint data-icon="inline-start"/>}Use Face ID or fingerprint</Button><FieldDescription className="text-center">Uses a passkey saved on a supported device. Password sign-in remains available.</FieldDescription></> : null}
    </FieldGroup></form></TabsContent>)}
  </Tabs>;
}
