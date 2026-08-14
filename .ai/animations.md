# Animations
## Purpose
Use motion to explain change, preserve context, and provide feedback.
## Philosophy
Motion is functional and restrained. It must never delay work or compete with content.
## Best Practices
- For React interfaces, use Framer Motion for declarative component and layout transitions, the native `IntersectionObserver` for scroll-triggered visibility, and GSAP for complex sequenced timelines. Do not add all three to a page unless each has a distinct job.
- Animate opacity and transforms; use consistent duration/easing tokens.
- Keep micro-interactions near 120–200ms and larger transitions near 200–300ms.
- Preserve spatial continuity for drawers, menus, and reordered items.
## Rules
- Every page receives one restrained mount transition for its primary content. Each meaningful section below the initial viewport uses a one-time `IntersectionObserver` reveal; do not animate every child independently.
- Marketing and documentation experiences include purposeful reveal, hover, and transition motion; static pages require an explicit product or accessibility reason.
- Scroll reveals trigger once by default, avoid layout shifts, and keep meaningful content available before JavaScript executes.
- GSAP animations must scope selectors to the owning component and clean up timelines on unmount.
- Product heroes that demonstrate a CLI should launch the real command, reveal the approved terminal banner line by line, then show version, context, help, and the ready prompt in their actual order. Keep all content visible when motion is reduced or JavaScript is unavailable.
- Honor `prefers-reduced-motion`; remove nonessential movement and autoplay.
- Never animate layout properties in repeated/high-frequency interactions.
- Focus placement and semantics remain correct throughout transitions.
## Examples
```tsx
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true));
  observer.observe(section);
  return () => observer.disconnect();
}, []);
```
```css
@media (prefers-reduced-motion: reduce) { .motion { animation: none; transition: none; } }
```
## Anti-patterns
Entrance animation on every element, bouncing CTAs, motion-only status, blocking page transitions.
## Checklist
- [ ] Motion communicates a state change.
- [ ] Reduced-motion behavior works.
- [ ] Framer Motion, IntersectionObserver, or GSAP has a clear, non-overlapping responsibility.
- [ ] The page mounts gracefully and below-fold sections reveal once as they enter the viewport.
- [ ] CLI demonstrations reproduce the real brand and command sequence rather than a generic terminal mockup.
- [ ] Animation is interruptible, performant, and accessible.

Related: `design.md`, `accessibility.md`, `performance.md`.
