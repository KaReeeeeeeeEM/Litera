# Product Design

## Purpose
Create a recognizable, calm, high-quality interface across products without redesigning each feature.

## Philosophy
Clarity precedes decoration. Use restrained surfaces, strong hierarchy, deliberate whitespace, and one clear primary action. Derive the product’s visual language from existing screens and tokens; this handbook does not impose a brand palette.

## Best Practices
- Every user-facing web application supports light and dark themes through semantic CSS variables; default to the operating-system preference and provide a persistent, accessible theme toggle.
- Start from user task, content hierarchy, and states before visual polish.
- Reuse semantic tokens for color, type, radius, spacing, elevation, and motion.
- Prefer a neutral canvas, subtle borders, limited elevation, and brand color for meaning and emphasis.
- Use an 8-point spacing rhythm with 4px for fine alignment unless the repository defines another scale.
- Design default, hover, focus, active, disabled, loading, empty, error, and success states together.

## Rules
- Preserve the approved product mark exactly across the header, favicon, downloads, PWA, and desktop packaging. Never invent, split, redraw, or substitute the logo without explicit approval.
- Version favicon and PWA icon URLs when artwork changes so browsers, service workers, and deployment CDNs invalidate stale icon caches.
- Theme changes use a click-origin circular reveal when the View Transition API is available: capture trigger coordinates, calculate the farthest-corner radius, and animate `::view-transition-new(root)` with a circular `clip-path`. Fall back immediately and disable the reveal for `prefers-reduced-motion`.
- Theme changes must update the root theme class without a flash of incorrect theme; components use semantic tokens rather than theme-specific hard-coded colors.
- Light and dark themes must both preserve WCAG contrast for body copy, muted copy, links, icons, borders, code blocks, terminals, syntax states, callouts, and interactive controls. A theme is incomplete if only the page background changes.
- When acknowledging the product toolchain, place a restrained linked-logo marquee after the first substantial value or credibility section—not between the hero and its immediate proof. Include the product itself when its standards or tooling were used to build the site; label the section honestly and do not imply sponsorship.
- Download pages use one dominant installation or platform action, clear runtime/platform availability, alternate installation paths below, release/help links, and generous focus. Avoid equal-weight card grids above the primary download.
- Interactive cards use the product primary color for a restrained hover-only border, tinted surface, and ambient background shadow. The glow must not obscure text, shift layout, or replace keyboard focus styling.
- Never hard-code a new color, shadow, font, or radius when a suitable token exists.
- A view has one dominant heading and normally one primary CTA.
- Dense tools may optimize scan speed; marketing pages may use more expressive composition, but both use shared foundations.
- Preserve recognizable brand and layout patterns from existing products.
- Documentation surfaces follow the article hierarchy and reference-review workflow in `documentation.md`; do not style them as marketing landing pages.

## Examples
```css
::view-transition-new(root) { animation: theme-ripple .7s ease-out; }
@keyframes theme-ripple { from { clip-path: circle(0 at var(--theme-x) var(--theme-y)); } to { clip-path: circle(var(--theme-radius) at var(--theme-x) var(--theme-y)); } }
```
```css
.card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); }
```

## Anti-patterns
- Gratuitous gradients, glass effects, oversized headings, or animation.
- Every card having equal visual weight.
- Placeholder-only labels or icon-only critical actions.

## Checklist
- [ ] Hierarchy communicates the main task immediately.
- [ ] Tokens and shared patterns are reused.
- [ ] All interaction states are designed.
- [ ] Light, dark, and system themes preserve contrast, hierarchy, charts, code blocks, and brand character.
- [ ] Theme transitions originate from the toggle, fall back safely, and honor reduced motion.
- [ ] Brand marks are identical across every product surface.
- [ ] Text, code, terminals, icons, and controls remain legible in both themes.
- [ ] Card hover glow uses the primary token consistently and remains subtle in both themes.
- [ ] Mobile, keyboard, contrast, and long-content behavior are sound.

Related: `ui-components.md`, `accessibility.md`, `responsiveness.md`, `animations.md`.
