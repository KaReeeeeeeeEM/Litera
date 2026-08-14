import type { Metadata } from "next";
import { ArrowRight, Download, Laptop, ShieldCheck } from "lucide-react";

import { PlatformDownloadGroups } from "@/components/download/platform-download-groups";
import { ClosingCta } from "@/components/site/closing-cta";
import { FaqSection } from "@/components/site/faq-section";
import { PageHero } from "@/components/site/page-hero";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDesktopReleases, installerFor } from "@/lib/github-releases";

export const metadata: Metadata = {
  title: "Download Litera for desktop",
  description: "Download Litera for desktop and mobile devices and keep your publishing workspace close at hand.",
  alternates: { canonical: "/download" },
};

export const revalidate = 300;

export default async function DownloadPage() {
  const releases = await getDesktopReleases();
  const latest = releases[0];

  return (
    <PageShell>
      <main>
        <PageHero eyebrow="Litera applications" title="Your publishing workspace, ready across devices." description="Use Litera in a focused native application on desktop and mobile—with the same secure projects, reviews, and narration workflow wherever you sign in." icon={Download} />

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><Badge variant="outline">Cross-platform</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Choose your operating system.</h2></div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">One Litera account keeps your work available across supported devices.</p>
          </div>
          <PlatformDownloadGroups release={latest} />
        </section>

        <section className="border-y bg-muted/30" id="releases"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24"><div className="mb-10"><Badge variant="outline">All releases</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Choose a version to download.</h2><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Use the latest release for normal installation, or select an earlier signed version when your environment requires it.</p></div><Card className="gap-0 py-0"><Table className="min-w-[56rem]"><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Released</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Installers</TableHead></TableRow></TableHeader><TableBody>{releases.map((release, index) => <TableRow key={release.id}><TableCell><div className="font-mono font-semibold">{release.tag_name.replace(/^desktop-/, "")}</div><div className="mt-1 text-xs text-muted-foreground">{release.name}</div></TableCell><TableCell>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(release.published_at))}</TableCell><TableCell>{index === 0 ? <Badge>Latest</Badge> : release.prerelease ? <Badge variant="secondary">Preview</Badge> : <Badge variant="outline">Stable</Badge>}</TableCell><TableCell><div className="flex flex-nowrap justify-end gap-2">{(["macOS", "Windows", "Linux", "Android", "iOS"] as const).map(platform => { const asset = installerFor(release, platform); return asset ? <Button asChild className="shrink-0" key={platform} size="sm"><a href={asset.browser_download_url}>{platform}<Download data-icon="inline-end"/></a></Button> : null; })}<Button asChild className="shrink-0" size="sm" variant="ghost"><a href={release.html_url} rel="noreferrer" target="_blank">Details<ArrowRight data-icon="inline-end"/></a></Button></div></TableCell></TableRow>)}</TableBody></Table></Card><p className="mt-3 text-xs text-muted-foreground sm:hidden">Swipe sideways to see every installer for a release.</p></div></section>

        <section className="border-y bg-muted/30"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-3 lg:px-8 lg:py-24">{[
          [Laptop, "A focused workspace", "Keep complex production work in a dedicated window without losing the clarity of Litera’s interface."],
          [ShieldCheck, "Secure by design", "A compact Rust-powered shell connects to the same protected Litera workspace and role controls."],
          [Download, "Native installers", "Purpose-built packages for macOS, Windows, and Linux are produced from the same tested release."],
        ].map(([Icon, title, text]) => { const FeatureIcon = Icon as typeof Laptop; return <div key={title as string}><FeatureIcon className="size-7 text-primary"/><h3 className="mt-5 text-xl font-semibold">{title as string}</h3><p className="mt-3 leading-7 text-muted-foreground">{text as string}</p></div>; })}</div></section>

        <FaqSection title="Desktop downloads, explained." items={[["Does the desktop app work offline?","Litera Desktop currently requires an internet connection because projects, accounts, review activity and publishing services are securely synchronized with the Litera workspace."],["Can I use the same account on different computers?","Yes. Sign in with your Litera account to access the workspace permitted by your role."],["Why is my download marked as an early-access build?","Desktop installers are published as signed, tested releases. Early access lets teams validate their operating environment before a wider rollout."],["How are updates delivered?","New installers are published as versioned releases. Managed automatic updates can be enabled after the signing and release channels are finalized."]]}/>
        <ClosingCta title="Bring a calmer publishing workflow to your desktop." description="Start in the browser today or request access to the next Litera desktop release." />
      </main>
    </PageShell>
  );
}
