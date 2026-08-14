"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [pending,setPending]=useState(false); const [sent,setSent]=useState(false); const [error,setError]=useState<string|null>(null);
  async function submit(formData:FormData){setPending(true);setError(null);const result=await authClient.requestPasswordReset({email:String(formData.get("email")??"").trim(),redirectTo:`${window.location.origin}/reset-password`});setPending(false);if(result.error){setError(result.error.message??"Unable to send the reset email.");return;}setSent(true);}
  if(sent)return <Alert><CheckCircle2/><AlertTitle>Check your email</AlertTitle><AlertDescription>If an account matches that address, a password-reset link is on its way.</AlertDescription></Alert>;
  return <form action={submit}><FieldGroup><Field><FieldLabel htmlFor="recovery-email">Email address</FieldLabel><Input autoComplete="email" id="recovery-email" name="email" placeholder="you@example.com" required type="email"/><FieldDescription>We’ll send a secure link that expires after 30 minutes.</FieldDescription></Field>{error?<Alert variant="destructive"><AlertCircle/><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>:null}<Button disabled={pending} size="lg" type="submit">{pending?<Loader2 className="animate-spin" data-icon="inline-start"/>:null}Send reset link<ArrowRight data-icon="inline-end"/></Button><Button asChild variant="ghost"><Link href="/login">Back to sign in</Link></Button></FieldGroup></form>;
}

export function ResetPasswordForm({token,errorCode}:{token?:string;errorCode?:string}) {
  const [pending,setPending]=useState(false); const [done,setDone]=useState(false); const [error,setError]=useState<string|null>(errorCode?"This reset link is invalid or has expired.":null);
  async function submit(formData:FormData){if(!token)return;const password=String(formData.get("password")??"");const confirmation=String(formData.get("confirmation")??"");if(password!==confirmation){setError("The passwords do not match.");return;}setPending(true);setError(null);const result=await authClient.resetPassword({newPassword:password,token});setPending(false);if(result.error){setError(result.error.message??"Unable to reset your password.");return;}setDone(true);}
  if(done)return <Alert><CheckCircle2/><AlertTitle>Password updated</AlertTitle><AlertDescription><Link className="font-medium text-primary hover:underline" href="/login">Return to sign in</Link> with your new password.</AlertDescription></Alert>;
  return <form action={submit}><FieldGroup><Field><FieldLabel htmlFor="new-password">New password</FieldLabel><Input autoComplete="new-password" id="new-password" minLength={12} name="password" placeholder="Create at least 12 characters" required type="password"/></Field><Field><FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel><Input autoComplete="new-password" id="confirm-password" minLength={12} name="confirmation" placeholder="Enter the new password again" required type="password"/></Field>{error?<Alert variant="destructive"><AlertCircle/><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>:null}<Button disabled={pending||!token} size="lg" type="submit">{pending?<Loader2 className="animate-spin" data-icon="inline-start"/>:null}Reset password<ArrowRight data-icon="inline-end"/></Button></FieldGroup></form>;
}
