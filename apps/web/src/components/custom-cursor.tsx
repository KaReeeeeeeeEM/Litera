"use client";

import { useEffect, useRef } from "react";

export function CustomCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const element = cursor.current;
    if (!element) return;
    document.documentElement.dataset.customCursor = "true";
    const move = (event: PointerEvent) => {
      element.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
      element.dataset.visible = "true";
      const target = event.target instanceof Element ? event.target : null;
      element.dataset.hidden = String(Boolean(target?.closest("input,textarea,[contenteditable='true'],[data-native-cursor]")));
      element.dataset.active = String(Boolean(target?.closest("a,button,[role='button'],select")));
    };
    const leave = () => { element.dataset.visible = "false"; };
    const enter = () => { element.dataset.visible = "true"; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);
    return () => { delete document.documentElement.dataset.customCursor; window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); document.removeEventListener("pointerenter", enter); };
  }, []);
  return <div aria-hidden className="litera-cursor" data-active="false" data-hidden="false" data-visible="false" ref={cursor}>
    <svg className="litera-cursor-pointer" fill="none" viewBox="0 0 24 24">
      <path d="M4.75 3.7v14.72c0 .91 1.1 1.36 1.74.71l3.48-3.52 2.67 5.17a1 1 0 0 0 1.35.43l1.78-.92a1 1 0 0 0 .43-1.35l-2.64-5.11 4.82-.64c.88-.12 1.14-1.26.4-1.75L6.3 3.02a1 1 0 0 0-1.55.68Z"/>
    </svg>
  </div>;
}
