import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, BookOpen, CircleCheck, Clock3, Settings, Users } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AppRole } from "@/lib/auth/permissions";

const roleCopy: Record<AppRole, { eyebrow: string; title: string; description: string }> = {
  member: { eyebrow: "Member workspace", title: "Keep your books moving.", description: "Create projects, continue page work and resolve the next release blocker." },
  stakeholder: { eyebrow: "Stakeholder workspace", title: "See progress without the noise.", description: "Review quality, leave decisions and understand how publishing work is progressing." },
  admin: { eyebrow: "Administration", title: "Keep Litera healthy.", description: "Oversee people, usage, platform health and high-risk access decisions." },
};

export function RoleWorkspace({ email, role }: { email: string; role: AppRole }) {
  const copy = roleCopy[role];
  return <div className="min-h-screen bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-5 lg:px-8"><BrandMark className="text-2xl" /><div><p className="text-xs text-muted-foreground">{copy.eyebrow}</p></div><div className="ms-auto flex items-center gap-3"><Badge variant="secondary">{role}</Badge><span className="hidden text-xs text-muted-foreground sm:inline">{email}</span></div></div></header><main className="mx-auto max-w-7xl px-5 py-10 lg:px-8"><div className="max-w-3xl"><Badge variant="outline">{copy.eyebrow}</Badge><h1 className="mt-5 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{copy.title}</h1><p className="mt-4 text-base leading-7 text-muted-foreground">{copy.description}</p></div>{role === "member" ? <MemberOverview /> : null}{role === "stakeholder" ? <StakeholderOverview /> : null}{role === "admin" ? <AdminOverview /> : null}</main></div>;
}

function MemberOverview(){return <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_.6fr]"><Card><CardHeader><CardTitle>Sayansi Darasa la 4</CardTitle><CardDescription>Last edited today · 5 pages</CardDescription></CardHeader><CardContent><Progress value={68}/><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link href="/studio">Continue storyboarding<ArrowRight data-icon="inline-end" /></Link></Button><Button variant="outline">Preview</Button></div></CardContent></Card><MetricCard icon={CircleCheck} label="Quality checks" value="18 / 22" detail="4 need review" /></div>}
function StakeholderOverview(){return <div className="mt-10 grid gap-4 md:grid-cols-3"><MetricCard icon={BookOpen} label="Active publications" value="12" detail="Across 4 subjects"/><MetricCard icon={Clock3} label="Awaiting review" value="3" detail="Oldest: 2 days"/><MetricCard icon={BarChart3} label="Release readiness" value="84%" detail="Up 6% this month"/></div>}
function AdminOverview(){return <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><MetricCard icon={Users} label="Active members" value="48" detail="7 joined this month"/><MetricCard icon={BookOpen} label="Projects" value="126" detail="34 active"/><MetricCard icon={BarChart3} label="Storage usage" value="62%" detail="248 GB available"/><MetricCard icon={Settings} label="Platform health" value="Healthy" detail="All services responding"/></div>}
function MetricCard({detail,icon:Icon,label,value}:{detail:string;icon:LucideIcon;label:string;value:string}){return <Card><CardHeader><div className="flex items-center justify-between"><CardDescription>{label}</CardDescription><Icon className="size-5 text-primary"/></div><CardTitle className="pt-3 text-3xl">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>}
