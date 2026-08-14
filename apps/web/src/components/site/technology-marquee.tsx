import Image from "next/image";

const technologies = [
  { name: "Next.js", logo: "/technologies/nextjs.svg" },
  { name: "React", logo: "/technologies/react.svg" },
  { name: "TypeScript", logo: "/technologies/typescript.svg" },
  { name: "Tailwind CSS", logo: "/technologies/tailwind.svg" },
  { name: "Better Auth", logo: "/technologies/better-auth.svg" },
  { name: "PostgreSQL", logo: "/technologies/postgresql.svg" },
  { name: "Drizzle", logo: "/technologies/drizzle.svg" },
];

export function TechnologyMarquee() {
  return <section className="overflow-hidden border-y bg-muted/25 py-7" aria-labelledby="technology-title"><div className="mx-auto mb-5 max-w-7xl px-5 lg:px-8"><p className="text-center text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground" id="technology-title">Built with dependable, open web technology</p></div><div className="marquee-track flex w-max items-center gap-12 px-6">{[...technologies, ...technologies].map((technology,index)=><div aria-hidden={index >= technologies.length} className="flex items-center gap-3 text-sm font-medium text-muted-foreground grayscale opacity-65" key={`${technology.name}-${index}`}><Image alt={index < technologies.length ? `${technology.name} logo` : ""} className="size-6 dark:invert" height={24} src={technology.logo} width={24}/><span>{technology.name}</span></div>)}</div></section>;
}
