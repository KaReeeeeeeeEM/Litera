import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";

export function AnnouncementBanner() {
  return <div className="hidden border-b border-primary/15 bg-primary/[.07] text-foreground md:block"><Link className="mx-auto flex min-h-10 max-w-7xl items-center justify-center gap-2 px-5 text-center text-xs font-medium transition-colors hover:bg-primary/[.04]" href="/features"><Megaphone className="size-3.5 text-primary" />Swahili-first speech review and role-based workspaces are now part of Litera<ArrowRight className="size-3.5 text-primary" /></Link></div>;
}
