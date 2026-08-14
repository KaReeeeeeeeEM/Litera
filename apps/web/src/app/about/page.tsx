import type { Metadata } from "next";
import { Compass, HeartHandshake, Info, Languages, ShieldCheck, Users } from "lucide-react";
import { PageHero } from "@/components/site/page-hero";
import { PageShell } from "@/components/site/page-shell";
import { ClosingCta } from "@/components/site/closing-cta";
import { FaqSection } from "@/components/site/faq-section";
import { VectorScene } from "@/components/site/vector-scene";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description: "Why Litera exists and who it serves.",
  alternates: { canonical: "/about" },
};

const audiences = [
  [Users, "Content teams", "Compose and review pages visually."],
  [Languages, "Language reviewers", "Approve speech in its teaching context."],
  [ShieldCheck, "Access specialists", "Verify inclusive alternatives early."],
  [HeartHandshake, "Publishers", "Release validated, reversible versions."],
] as const;

export default function AboutPage() {
  return (
    <PageShell>
      <main>
        <PageHero eyebrow="About Litera" title="Publishing technology should make inclusive learning easier." description="Litera helps multidisciplinary teams turn educational sources into accessible digital experiences without requiring everyone to become a web developer." icon={Info} />
        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">Our point of view</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">Built around the real work.</h2>
              <p className="mt-5 leading-8 text-muted-foreground">Content specialists, language reviewers, accessibility experts and publishers need one shared view of a page—not a chain of disconnected technical tools.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {audiences.map(([Icon, title, text]) => <Card className="motion-card" key={title}><CardHeader><Icon className="size-5 text-primary" /><CardTitle className="text-base">{title}</CardTitle><CardDescription className="leading-6">{text}</CardDescription></CardHeader></Card>)}
            </div>
          </div>
        </section>
        <section id="approach" className="border-y bg-muted/30" data-reveal>
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-3 lg:px-8">
            <div className="lg:col-span-1"><Compass className="size-7 text-primary" /><h2 className="mt-5 text-3xl font-semibold tracking-tight">What guides Litera</h2></div>
            <div className="grid gap-8 sm:grid-cols-3 lg:col-span-2">
              {[['Clarity','Complex work should feel understandable from the first screen.'],['Confidence','Quality checks should appear while teams can still act on them.'],['Reach','Language, ability and device should never decide who can learn.']].map(([title,text]) => <div key={title}><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-14 px-5 py-24 lg:grid-cols-2 lg:items-center lg:px-8" data-reveal><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">Our approach</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">The learner stays at the centre.</h2><p className="mt-5 leading-8 text-muted-foreground">Litera connects creative decisions to their effect on comprehension, language and access. Teams do not simply finish files—they build experiences that can be understood and trusted.</p><div className="mt-8 grid grid-cols-3 gap-3">{[["01","Understand"],["02","Create"],["03","Verify"]].map(([n,label])=><div className="rounded-xl border p-4" key={label}><span className="font-mono text-xs text-primary">{n}</span><p className="mt-5 font-semibold">{label}</p></div>)}</div></div><VectorScene variant="review"/></section>
        <section className="border-y bg-muted/30" data-reveal><div className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">The future we are building</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">More useful learning, in more hands.</h2><p className="mt-5 leading-8 text-muted-foreground">We imagine publishing teams moving from technical handoffs to shared understanding: local language voices are treated with care, accessibility is visible from the beginning and every release can reach learners across devices and connectivity levels.</p></div></div></section>
        <FaqSection title="About Litera, in context." items={[["Who is Litera for?","Publishers, content teams, language reviewers, accessibility specialists and stakeholders creating digital educational experiences."],["Why focus on Swahili narration?","Natural, reviewable local-language speech is essential to the quality and usefulness of many East African learning experiences."],["Is Litera only an authoring tool?","It connects authoring, review, quality evidence and release so teams can manage the full publishing journey."],["What does calm software mean here?","It means clear priorities, progressive disclosure and interfaces that reduce the cognitive load of complex publishing work."]]}/>
        <ClosingCta title="Build learning experiences your whole team can stand behind." description="Bring authors, reviewers and decision-makers into one transparent publishing journey."/>
      </main>
    </PageShell>
  );
}
