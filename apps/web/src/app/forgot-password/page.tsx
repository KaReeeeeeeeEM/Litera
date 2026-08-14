import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/password-recovery-form";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata:Metadata={title:"Forgot password — Litera",description:"Request a secure Litera password-reset link."};
export default function ForgotPasswordPage(){return <><AuthThemeToggle/><main className="grid min-h-screen place-items-center bg-primary/5 p-5"><div className="w-full max-w-md"><Link className="mb-8 flex items-center justify-center gap-3 font-semibold" href="/"><BrandMark/></Link><Card><CardHeader><KeyRound className="mb-3 size-7 text-primary"/><CardTitle className="text-2xl">Reset your password</CardTitle><CardDescription>Enter the email address connected to your Litera account.</CardDescription></CardHeader><CardContent><ForgotPasswordForm/></CardContent></Card></div></main></>}
