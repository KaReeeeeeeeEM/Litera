"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";

export function TwoFactorSetup() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enable(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await authClient.twoFactor.enable({ password: String(formData.get("password") ?? "") });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Unable to begin 2FA setup.");
      return;
    }
    setTotpUri(result.data?.totpURI ?? null);
  }

  async function verify(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: String(formData.get("code") ?? "") });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "That code could not be verified.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  if (totpUri) {
    return <form action={verify}><FieldGroup><Alert><ShieldCheck /><AlertTitle>Add Litera to your authenticator</AlertTitle><AlertDescription>Use this setup URI in your authenticator application, then enter the current six-digit code.</AlertDescription></Alert><Field><FieldLabel htmlFor="totp-uri">Authenticator setup URI</FieldLabel><Input id="totp-uri" readOnly value={totpUri} /></Field><Field><FieldLabel htmlFor="totp-code">Verification code</FieldLabel><Input autoComplete="one-time-code" id="totp-code" inputMode="numeric" maxLength={6} name="code" pattern="[0-9]{6}" placeholder="123456" required /><FieldDescription>Enter the six-digit code shown in your authenticator.</FieldDescription></Field>{error ? <p className="text-sm text-destructive">{error}</p> : null}<Button disabled={pending} type="submit">{pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}Verify and continue</Button></FieldGroup></form>;
  }

  return <form action={enable}><FieldGroup><Field><FieldLabel htmlFor="current-password">Confirm your password</FieldLabel><Input autoComplete="current-password" id="current-password" name="password" placeholder="Enter your current password" required type="password" /><FieldDescription>Litera requires confirmation before creating a 2FA secret.</FieldDescription></Field>{error ? <p className="text-sm text-destructive">{error}</p> : null}<Button disabled={pending} type="submit">{pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}Set up two-factor authentication</Button></FieldGroup></form>;
}
