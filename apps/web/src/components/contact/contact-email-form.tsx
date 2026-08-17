"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "@/lib/feedback";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ContactEmailForm() {
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) throw new Error(result.message || "Your message could not be sent.");
      toast.success(result.message || "Your message has been sent.");
      form.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Your email address</FieldLabel>
          <Input autoComplete="email" id="email" name="email" placeholder="you@organisation.com" required type="email" />
          <FieldDescription>We’ll use this address to reply to your message.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="title">Email title</FieldLabel>
          <Input id="title" maxLength={120} name="title" placeholder="How can Litera support your publishing team?" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea className="min-h-44 resize-y" id="description" maxLength={4000} name="description" placeholder="Tell us what you publish, who is involved, the languages you support, and where your current workflow becomes difficult." required />
          <FieldDescription>Include enough context for us to understand the right next step.</FieldDescription>
        </Field>
        <div aria-hidden="true" className="absolute -left-[9999px]" tabIndex={-1}>
          <label htmlFor="website">Website</label>
          <input autoComplete="off" id="website" name="website" tabIndex={-1} />
        </div>
        <Button className="mt-2 w-full sm:w-auto" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
          {pending ? "Sending…" : "Send email"}
        </Button>
      </FieldGroup>
    </form>
  );
}
