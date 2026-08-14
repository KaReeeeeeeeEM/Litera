import type { Metadata } from "next";
import { ArrowUpRight, Download, RefreshCw, ShieldCheck } from "lucide-react";

import { DesktopUpdateControl } from "@/components/updates/desktop-update-control";
import { PageHero } from "@/components/site/page-hero";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktopReleases, releaseNotes } from "@/lib/github-releases";

export const metadata: Metadata = { title: "Updates — Litera", description: "Follow Litera releases, improvements, fixes, and desktop upgrade guidance." };
export const revalidate = 300;

export default async function UpdatesPage() {
  const timeline = await getDesktopReleases();
  return <PageShell><main>
    <PageHero eyebrow="Product updates" title="Every Litera improvement, release, and upgrade." description="Follow what changed, review fixes, and keep Litera Desktop current through signed releases." icon={RefreshCw}/>
    <section className="mx-auto grid max-w-6xl gap-6 px-5 py-20 lg:grid-cols-[1fr_.75fr] lg:px-8 lg:py-24"><Card><CardHeader><Badge className="mb-3" variant="outline">Desktop updater</Badge><CardTitle className="text-2xl">Keep Litera current.</CardTitle><CardDescription className="max-w-xl leading-7">Litera checks signed GitHub release metadata and verifies every update package before installation.</CardDescription></CardHeader><CardContent><DesktopUpdateControl/></CardContent></Card><Card className="bg-muted/30"><CardHeader><ShieldCheck className="size-6 text-primary"/><CardTitle className="pt-3">Safe upgrade path</CardTitle><CardDescription className="leading-7">Open this page in Litera Desktop, check for updates, approve the signed package, and the application restarts on the new version.</CardDescription></CardHeader></Card></section>
    <section className="border-y bg-muted/30"><div className="mx-auto max-w-4xl px-5 py-20 lg:px-8 lg:py-24"><div className="mb-12"><Badge variant="outline">Changelog timeline</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight">Every release, fix, and improvement.</h2><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">This timeline reads published Litera releases directly from GitHub and refreshes automatically.</p></div><div className="relative ml-2 border-l pl-8 sm:pl-12">{timeline.map(release => <article className="relative pb-16 last:pb-0 sm:pb-20" key={release.id}><span className="absolute -left-[2.34rem] top-2 size-3 rounded-full border-2 border-background bg-primary sm:-left-[3.34rem]"/><div className="flex flex-wrap items-center gap-3"><h3 className="font-mono text-2xl font-semibold">{release.tag_name.replace(/^desktop-/, "")}</h3><Badge variant="outline">Desktop</Badge>{release.prerelease ? <Badge variant="secondary">Preview</Badge> : null}</div><p className="mt-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(release.published_at))}</p><h4 className="mt-5 text-lg font-semibold">{release.name || "Litera Desktop update"}</h4><ul className="mt-4 space-y-2 text-muted-foreground">{releaseNotes(release.body).map(item => <li key={item}>— {item}</li>)}</ul><a className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href={release.html_url} rel="noreferrer" target="_blank"><Download className="size-4"/>Release notes and downloads<ArrowUpRight className="size-3"/></a></article>)}</div></div></section>
  </main></PageShell>;
}
