import { NextResponse } from "next/server";
import { z } from "zod";

import { sendContactEmail } from "@/lib/auth/email";

const contactSchema = z.object({
  email: z.string().trim().email().max(254),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  try {
    const result = contactSchema.safeParse(await request.json());

    if (!result.success) {
      return NextResponse.json({ message: "Please check the details and try again." }, { status: 400 });
    }

    await sendContactEmail(result.data);
    return NextResponse.json({ message: "Your message has been sent to the Litera team." });
  } catch (error) {
    console.error("Unable to send Litera contact email", error);
    return NextResponse.json({ message: "We could not send your message right now. Please try again." }, { status: 500 });
  }
}
