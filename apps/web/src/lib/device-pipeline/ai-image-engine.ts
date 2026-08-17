export async function editImageWithOpenAi({
  image,
  instruction,
  apiKey,
  signal,
}: {
  image: Blob;
  instruction: string;
  apiKey: string;
  signal?: AbortSignal;
}) {
  if (!apiKey.trim()) throw new Error("Configure an OpenAI key to edit images with AI.");
  if (!instruction.trim()) throw new Error("Describe what should change in the image.");

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append(
    "prompt",
    `Edit the supplied book image according to this instruction: ${instruction.trim()} Preserve all other subjects, composition, educational meaning, labels, colors, and visual style. Return only the edited image.`,
  );
  form.append("image", image, `book-image.${image.type.includes("jpeg") ? "jpg" : "png"}`);
  form.append("size", "auto");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    body: form,
    signal,
  });
  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "AI image editing failed.");
  const result = payload.data?.[0];
  if (result?.b64_json) {
    const binary = atob(result.b64_json);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
  }
  if (result?.url) {
    const imageResponse = await fetch(result.url, { signal });
    if (imageResponse.ok) return imageResponse.blob();
  }
  throw new Error("The image provider returned no edited image.");
}
