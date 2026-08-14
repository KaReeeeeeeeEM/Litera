import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ClosingCta({ description, href = "/download", label = "Download Litera", title }: { description: string; href?: string; label?: string; title: string }) {
  return <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" data-reveal><Card className="relative overflow-hidden bg-primary text-primary-foreground"><div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary-foreground/10 blur-3xl"/><div className="relative grid gap-8 p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-14"><div><Badge variant="secondary">Create with confidence</Badge><h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-primary-foreground/75">{description}</p></div><Button asChild size="lg" variant="secondary"><Link href={href}>{label}<ArrowRight data-icon="inline-end"/></Link></Button></div></Card></section>;
}
