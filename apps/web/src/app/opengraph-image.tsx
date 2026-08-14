import { ImageResponse } from "next/og";

export const alt = "Litera — Inclusive publishing, made clear";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ alignItems: "stretch", background: "#faf7f5", color: "#1f1917", display: "flex", height: "100%", padding: "58px", width: "100%" }}>
      <div style={{ border: "1px solid #dfc8c1", borderRadius: 38, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden", padding: "54px 62px", position: "relative", width: "100%" }}>
        <div style={{ background: "#a63a2b", borderRadius: 999, height: 360, opacity: 0.08, position: "absolute", right: -90, top: -130, width: 360 }} />
        <div style={{ color: "#a63a2b", display: "flex", fontFamily: "Georgia", fontSize: 58, fontStyle: "italic", fontWeight: 700, letterSpacing: -3 }}>Litera</div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div style={{ fontSize: 70, fontWeight: 650, letterSpacing: -4, lineHeight: 1.02 }}>Inclusive publishing, made clear.</div>
          <div style={{ color: "#6c5d58", fontSize: 28, lineHeight: 1.4, marginTop: 24 }}>Accessible digital learning experiences with visual storyboarding and Swahili-first narration.</div>
        </div>
        <div style={{ alignItems: "center", color: "#796963", display: "flex", fontSize: 22, justifyContent: "space-between" }}>
          <span>litera.almareem.com</span><span>macOS · Windows · Linux</span>
        </div>
      </div>
    </div>,
    size,
  );
}
