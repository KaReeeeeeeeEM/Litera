# Responsiveness
## Purpose
Make workflows effective across content sizes, input modes, and viewports.
## Philosophy
Responsive behavior is a release requirement, not optional polish. Design fluidly around content pressure, not device labels, and preserve capability while changing composition.
## Best Practices
- Start with the narrow layout; add container/media queries where content needs space.
- Use flexible grids, intrinsic sizing, responsive assets, and sensible line lengths.
- Convert dense tables to scroll, priority columns, or structured cards based on task.
## Rules
- A feature is incomplete until it is verified at phone, tablet, laptop, and wide-desktop widths using both touch and keyboard input.
- No essential action or information disappears solely due to viewport size.
- Avoid fixed page dimensions and horizontal page overflow.
- Test at minimum 320px, 375px, 768px, 1024px, and 1440px plus 200% zoom/reflow, landscape, touch, keyboard, and long localized text.
- Use `minmax(0, 1fr)`, `min-width: 0`, wrapping, and controlled local scrolling so code, tables, forms, and generated identifiers never widen the page.
## Examples
```css
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(18rem,100%),1fr)); }
```
## Anti-patterns
Desktop shrunk to mobile, breakpoint proliferation, hover-only controls, clipped dialogs.
## Checklist
- [ ] Content drives breakpoints.
- [ ] Navigation, tables, forms, dialogs, and media adapt.
- [ ] Touch, zoom, long text, and safe areas work.
- [ ] Automated or browser-assisted viewport checks cover phone, tablet, desktop, and wide desktop without horizontal page overflow.

Related: `design.md`, `accessibility.md`, `frontend.md`.
