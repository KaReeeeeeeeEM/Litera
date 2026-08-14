import { AudioLines, BookOpen, Check, Languages, BadgeCheck, MousePointer2 } from "lucide-react";

export function VectorScene({ variant = "compose" }: { variant?: "compose" | "listen" | "review" }) {
  const copy = variant === "listen" ? { label: "Sauti ya Kiswahili", title: "Sikiliza. Rekebisha. Thibitisha.", icon: AudioLines } : variant === "review" ? { label: "Quality review", title: "Every check in one calm view.", icon: Check } : { label: "Visual storyboard", title: "A lesson taking shape.", icon: BookOpen };
  const Icon = copy.icon;
  return <div className="illustration-float relative mx-auto aspect-[4/3] w-full max-w-xl" aria-label={copy.title} role="img">
    <div className="absolute inset-x-[8%] bottom-[3%] top-[12%] rotate-2 rounded-[2rem] bg-primary/10" />
    <div className="absolute inset-x-[4%] bottom-[8%] top-[4%] -rotate-1 overflow-hidden rounded-[2rem] border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div className="flex gap-2"><i className="size-2 rounded-full bg-border"/><i className="size-2 rounded-full bg-border"/><i className="size-2 rounded-full bg-primary"/></div><span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary">{copy.label}</span></div>
      <div className="grid h-full grid-cols-[5rem_1fr]"><div className="flex flex-col gap-3 border-e bg-muted/40 p-3"><span className="h-9 rounded-lg bg-primary"/><span className="h-9 rounded-lg bg-background"/><span className="h-9 rounded-lg bg-background"/></div><div className="p-5"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5"/></span><div><span className="block h-2 w-24 rounded-full bg-border"/><span className="mt-2 block h-2 w-36 rounded-full bg-muted"/></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="grid aspect-square place-items-center rounded-2xl bg-primary/10"><Languages className="size-10 text-primary"/></div><div className="flex flex-col gap-2 rounded-2xl border p-3"><span className="h-2 w-full rounded bg-muted"/><span className="h-2 w-4/5 rounded bg-muted"/><span className="mt-auto flex items-center gap-2 text-[10px] text-primary"><BadgeCheck className="size-3"/>Ready to review</span></div></div></div></div>
    </div>
    <div className="absolute -bottom-1 right-0 flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-medium shadow-lg"><MousePointer2 className="size-4 text-primary"/>Edit visually</div>
  </div>;
}
