import { NextResponse } from "next/server";
import { z } from "zod";

import { sendFeedbackEmail } from "@/lib/auth/email";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const MAX_TOTAL_SIZE = 4 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const feedbackSchema = z.object({
  category: z.enum(["issue", "idea", "accessibility", "compliment"]),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional(),
  page: z.string().trim().url().max(2048),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = feedbackSchema.safeParse(Object.fromEntries(formData));

    if (!result.success) {
      return NextResponse.json({ message: "Please check the feedback details and try again." }, { status: 400 });
    }

    const screenshots = formData.getAll("screenshots").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const totalSize = screenshots.reduce((sum, file) => sum + file.size, 0);

    if (screenshots.length > 3 || totalSize > MAX_TOTAL_SIZE || screenshots.some((file) => file.size > MAX_FILE_SIZE || !acceptedImageTypes.has(file.type))) {
      return NextResponse.json({ message: "Attach up to 3 PNG, JPG, or WebP images with a combined size below 4 MB." }, { status: 400 });
    }

    const attachments = await Promise.all(screenshots.map(async (file) => ({
      filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-"),
      contentType: file.type,
      content: Buffer.from(await file.arrayBuffer()),
    })));

    await sendFeedbackEmail({ ...result.data, email: result.data.email || undefined, attachments });
    return NextResponse.json({ message: "Thank you — your feedback has reached the Litera team." });
  } catch (error) {
    console.error("Unable to send Litera feedback", error);
    return NextResponse.json({ message: "We could not send your feedback right now. Please try again." }, { status: 500 });
  }
}
