import type { Metadata } from "next";
import { BookOpenCheck, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in — Litera", description: "Sign in or create your Litera member account." };

export default function LoginPage() {
  return <><AuthThemeToggle/><main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]"><section className="hidden bg-primary/10 p-12 text-foreground lg:flex lg:flex-col lg:justify-between"><Link className="flex items-center gap-3 font-semibold" href="/"><BrandMark /></Link><div className="max-w-xl"><UsersRound className="size-8 text-primary" /><h1 className="mt-7 text-5xl font-semibold tracking-[-.05em]">A focused workspace for every publishing role.</h1><p className="mt-6 text-lg leading-8 text-muted-foreground">Members create. Stakeholders review. Administrators keep the platform healthy and secure.</p></div><div className="flex gap-6 text-xs text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Secure sessions</span><span className="flex items-center gap-2"><BookOpenCheck className="size-4 text-primary" />Accessible by design</span></div></section><section className="flex items-center justify-center bg-muted/30 p-5 sm:p-10"><Card className="w-full max-w-md"><CardHeader><div className="mb-3 lg:hidden"><BrandMark /></div><CardTitle className="text-2xl">Welcome to Litera</CardTitle><CardDescription>Sign in, or create a member account to start publishing.</CardDescription></CardHeader><CardContent><AuthForm /></CardContent></Card></section></main></>;
}
