import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/password-recovery-form";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata:Metadata={title:"Choose a new password — Litera",description:"Securely update your Litera password."};
export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{token?:string;error?:string}>}){const params=await searchParams;return <><AuthThemeToggle/><main className="grid min-h-screen place-items-center bg-primary/5 p-5"><div className="w-full max-w-md"><Link className="mb-8 flex items-center justify-center gap-3 font-semibold" href="/"><BrandMark/></Link><Card><CardHeader><LockKeyhole className="mb-3 size-7 text-primary"/><CardTitle className="text-2xl">Choose a new password</CardTitle><CardDescription>Use at least 12 characters that you do not reuse elsewhere.</CardDescription></CardHeader><CardContent><ResetPasswordForm errorCode={params.error} token={params.token}/></CardContent></Card></div></main></>}
