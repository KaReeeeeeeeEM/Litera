import type { Metadata } from "next";
import { Clock3, Mail } from "lucide-react";

import { ContactEmailForm } from "@/components/contact/contact-email-form";
import { PageHero } from "@/components/site/page-hero";
import { PageShell } from "@/components/site/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Email the Litera team",
  description: "Send a message to the Litera team about your publishing workflow.",
  alternates: { canonical: "/contact/email" },
};

export default function ContactEmailPage() {
  return (
    <PageShell>
      <main>
        <PageHero eyebrow="Contact Litera" title="Tell us what you’re working on." description="Share your publishing context and the Litera team will respond with a focused next step." icon={Mail} />
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] lg:px-8 lg:py-24">
          <Card>
            <CardHeader className="border-b p-7 sm:p-9">
              <CardTitle className="text-2xl">Compose your message</CardTitle>
              <CardDescription className="text-base">Every field helps us route your enquiry to the right conversation.</CardDescription>
            </CardHeader>
            <CardContent className="p-7 sm:p-9"><ContactEmailForm /></CardContent>
          </Card>
          <aside className="space-y-5">
            <Card className="bg-muted/40">
              <CardHeader>
                <Clock3 className="size-6 text-primary" />
                <CardTitle className="pt-3">What happens next</CardTitle>
                <CardDescription className="leading-7">The Litera team will review your message and reply directly to the email address you provide.</CardDescription>
              </CardHeader>
            </Card>
            <p className="px-2 text-sm leading-6 text-muted-foreground">Please don’t include passwords, private learner records, or other sensitive information in your message.</p>
          </aside>
        </section>
      </main>
    </PageShell>
  );
}
