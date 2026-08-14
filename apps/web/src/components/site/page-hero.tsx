import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function PageHero({ description, eyebrow, icon: Icon, title }: { description: string; eyebrow: string; icon: LucideIcon; title: string }) {
  return <section className="border-b bg-muted/30"><div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20"><Badge className="mb-5 bg-background text-primary" variant="outline"><Icon />{eyebrow}</Badge><h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{title}</h1><p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{description}</p></div></section>;
}
