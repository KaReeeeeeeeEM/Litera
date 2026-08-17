"use client";

import { createElement } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";

type SuccessOptions = Parameters<typeof sonnerToast.success>[1];
type ErrorOptions = Parameters<typeof sonnerToast.error>[1];
type InfoOptions = Parameters<typeof sonnerToast.info>[1];
type WarningOptions = Parameters<typeof sonnerToast.warning>[1];
type LoadingOptions = Parameters<typeof sonnerToast.loading>[1];

function playTone(kind: "success" | "complete" | "warning" | "error") {
  if (typeof window === "undefined" || localStorage.getItem("litera-feedback-sounds") === "off") return;
  try {
    const context = new AudioContext();
    void context.resume();
    const patterns = {
      success: [[523.25, 0], [659.25, .09]],
      complete: [[523.25, 0], [659.25, .08], [783.99, .17]],
      warning: [[392, 0], [349.23, .12]],
      error: [[311.13, 0], [233.08, .12]],
    } as const;
    const start = context.currentTime;
    for (const [frequency, offset] of patterns[kind]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "error" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.055, start + offset + .015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + .16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + .17);
    }
    window.setTimeout(() => void context.close(), 500);
  } catch { /* Audio feedback is progressive enhancement. */ }
}

export const toast = {
  success(message: Parameters<typeof sonnerToast.success>[0], options?: SuccessOptions) { playTone("success"); return sonnerToast.success(message, { ...options, icon: options?.icon ?? createElement(CheckCircle2, { className: "size-5 animate-in zoom-in-50 spin-in-12 text-emerald-600 duration-300" }) }); },
  complete(message: Parameters<typeof sonnerToast.success>[0], options?: SuccessOptions) { playTone("complete"); return sonnerToast.success(message, { ...options, icon: options?.icon ?? createElement(CheckCircle2, { className: "size-5 animate-in zoom-in-50 spin-in-12 text-emerald-600 duration-300" }) }); },
  error(message: Parameters<typeof sonnerToast.error>[0], options?: ErrorOptions) { playTone("error"); return sonnerToast.error(message, { ...options, icon: options?.icon ?? createElement(XCircle, { className: "size-5 animate-in zoom-in-50 spin-in-12 text-destructive duration-300" }) }); },
  warning(message: Parameters<typeof sonnerToast.warning>[0], options?: WarningOptions) { playTone("warning"); return sonnerToast.warning(message, options); },
  info(message: Parameters<typeof sonnerToast.info>[0], options?: InfoOptions) { return sonnerToast.info(message, options); },
  loading(message: Parameters<typeof sonnerToast.loading>[0], options?: LoadingOptions) { return sonnerToast.loading(message, options); },
};
