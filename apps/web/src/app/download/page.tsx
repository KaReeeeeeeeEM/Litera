import type { Metadata } from "next";
import { ArrowRight, Check, Download, Laptop, ShieldCheck } from "lucide-react";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa6";

import { ClosingCta } from "@/components/site/closing-cta";
import { FaqSection } from "@/components/site/faq-section";
import { PageHero } from "@/components/site/page-hero";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDesktopReleases, installerFor } from "@/lib/github-releases";

export const metadata: Metadata = {
  title: "Download Litera — Desktop publishing workspace",
  description: "Download Litera for macOS, Windows, or Linux and keep your publishing workspace close at hand.",
};

const platforms = [
  { name: "macOS", detail: "Apple Silicon and Intel", requirement: "macOS 11 or later", icon: FaApple },
  { name: "Windows", detail: "64-bit installer", requirement: "Windows 10 or later", icon: FaWindows },
  { name: "Linux", detail: "AppImage and Debian package", requirement: "Modern 64-bit distribution", icon: FaLinux },
];

export const revalidate = 300;

export default async function DownloadPage() {
  const releases = await getDesktopReleases();
  const latest = releases[0];

  return (
    <PageShell>
      <main>
        <PageHero eyebrow="Litera Desktop" title="Your publishing workspace, ready on every desktop." description="Use Litera in a focused native window on macOS, Windows, and Linux—with the same secure projects, reviews, and narration workflow wherever you sign in." icon={Download} />

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><Badge variant="outline">Cross-platform</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Choose your operating system.</h2></div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">One Litera account keeps your work available across supported devices.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {platforms.map(({ detail, icon: Icon, name, requirement }) => {
              const installer = installerFor(latest, name as "macOS" | "Windows" | "Linux");
              return (
              <Card className="motion-card gap-0 py-0" key={name}>
                <CardHeader className="p-6 pb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon aria-hidden="true" className="size-6 text-primary" /></div>
                    <div><CardTitle className="text-xl">Litera for {name}</CardTitle><CardDescription className="mt-1">{detail}</CardDescription></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-6 pb-6"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" />{requirement}</p><Button asChild className="w-full"><a href={installer?.browser_download_url || latest.html_url}>Quick download<Download/><span className="sr-only"> Litera for {name}</span></a></Button></CardContent>
              </Card>
            );})}
          </div>
        </section>

        <section className="border-y bg-muted/30" id="releases"><div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24"><div className="mb-10"><Badge variant="outline">All releases</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Choose a version to download.</h2><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Use the latest release for normal installation, or select an earlier signed version when your environment requires it.</p></div><Card className="gap-0 py-0"><Table><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Released</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Installers</TableHead></TableRow></TableHeader><TableBody>{releases.map((release, index) => <TableRow key={release.id}><TableCell><div className="font-mono font-semibold">{release.tag_name.replace(/^desktop-/, "")}</div><div className="mt-1 text-xs text-muted-foreground">{release.name}</div></TableCell><TableCell>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(release.published_at))}</TableCell><TableCell>{index === 0 ? <Badge>Latest</Badge> : release.prerelease ? <Badge variant="secondary">Preview</Badge> : <Badge variant="outline">Stable</Badge>}</TableCell><TableCell><div className="flex flex-wrap justify-end gap-2">{(["macOS", "Windows", "Linux"] as const).map(platform => { const asset = installerFor(release, platform); return asset ? <Button asChild key={platform} size="sm"><a href={asset.browser_download_url}>{platform}<Download/></a></Button> : null; })}<Button asChild size="sm" variant="ghost"><a href={release.html_url} rel="noreferrer" target="_blank">Details<ArrowRight/></a></Button></div></TableCell></TableRow>)}</TableBody></Table></Card></div></section>

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
