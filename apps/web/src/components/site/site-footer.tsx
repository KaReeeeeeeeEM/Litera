import Link from "next/link";
import { ArrowUpRight, Mail, MapPin } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const groups = [
  { title: "Platform", links: [["Features","/features"],["Accessibility","/accessibility"],["Download","/download"],["Workspace","/studio"],["Sign in","/login"]] },
  { title: "Company", links: [["About Litera","/about"],["Contact","/contact"],["Our approach","/about#approach"]] },
  { title: "Resources", links: [["Publishing workflow","/features#workflow"],["Swahili narration","/features#narration"],["Inclusive output","/accessibility#standards"]] },
] as const;

export function SiteFooter() {
  return <footer className="relative overflow-hidden border-t bg-muted/40 text-foreground">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-[.09em] text-center text-[27vw] font-semibold leading-[.72] text-foreground/[.035]">Litera</div>
    <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
      <div className="grid gap-14 border-b border-foreground/15 pb-16 lg:grid-cols-[1.45fr_repeat(3,1fr)]">
        <div><Link className="inline-flex items-center gap-3 text-xl font-semibold" href="/"><BrandMark className="text-4xl"/></Link><p className="mt-7 max-w-sm text-sm leading-7 text-muted-foreground">A calm, collaborative workspace for turning educational sources into responsive, accessible and narratable learning experiences.</p><div className="mt-7 flex flex-col gap-3 text-sm text-muted-foreground"><a className="flex items-center gap-2 transition-colors hover:text-foreground" href="mailto:hello@litera.local"><Mail className="size-4"/>hello@litera.local</a><span className="flex items-center gap-2"><MapPin className="size-4"/>Dar es Salaam, Tanzania</span></div></div>
        {groups.map(group => <div key={group.title}><h2 className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">{group.title}</h2><div className="mt-6 grid gap-4 text-sm">{group.links.map(([label,href]) => <Link className="group flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground" href={href} key={href}>{label}<ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100"/></Link>)}</div></div>)}
      </div>
      <div className="flex flex-col gap-4 pt-7 text-[11px] font-semibold uppercase tracking-[.1em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>© 2026 Litera. Inclusive publishing technology.</p><div className="flex gap-5"><Link className="hover:text-foreground" href="/accessibility">Accessibility</Link><Link className="hover:text-foreground" href="/contact">Support</Link></div></div>
    </div>
  </footer>;
}
