import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/site/announcement-banner";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { PageRevealObserver } from "@/components/site/page-reveal-observer";

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground"><AnnouncementBanner /><SiteHeader />{children}<SiteFooter /><PageRevealObserver /></div>;
}
