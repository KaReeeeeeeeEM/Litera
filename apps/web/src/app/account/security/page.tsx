import { ShieldCheck } from "lucide-react";

import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { PasskeySetup } from "@/components/auth/passkey-setup";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/guards";

export default async function SecurityPage() {
  await requireSession();
  return <><AuthThemeToggle/><main className="min-h-screen bg-muted/30 p-5 py-16"><div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2"><Card><CardHeader><ShieldCheck className="size-7 text-primary" /><CardTitle className="pt-4 text-2xl">Two-factor authentication</CardTitle><CardDescription>Administrative accounts must use an authenticator application before accessing platform controls.</CardDescription></CardHeader><CardContent><TwoFactorSetup /></CardContent></Card><Card><CardHeader><ShieldCheck className="size-7 text-primary"/><CardTitle className="pt-4 text-2xl">Face ID or fingerprint</CardTitle><CardDescription>Add a passkey for fast, phishing-resistant sign-in on a supported device.</CardDescription></CardHeader><CardContent><PasskeySetup/></CardContent></Card></div></main></>;
}
