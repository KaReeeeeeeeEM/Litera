# UI Components
## Purpose
Build a coherent, accessible component system without limiting feature composition.
## Philosophy
Use tokens for decisions, primitives for behavior, and composed patterns for recurring product tasks. APIs should be explicit and hard to misuse.
## Best Practices
- Separate headless behavior from visual variants where useful.
- Use composition and semantic variants (`danger`, `quiet`) rather than style escape hatches.
- Document states, content rules, accessibility, and responsive behavior in examples.
## Rules
- Never ship raw native interactive controls when the project has a component system. Buttons, selects/dropdowns, inputs, checkboxes, radios, dialogs, tabs, tooltips, and menus use the approved library component (shadcn/Radix by default for React projects).
- Product code consumes the library API so styling, focus, validation, motion, and theming stay consistent; native semantics remain encapsulated inside the library primitive.
- Preset and configuration interfaces show current selections, explain consequences in plain language, and preview resulting output before it is applied or copied.
- Code, command, terminal, and copy components consume semantic foreground, surface, border, muted, success, and accent tokens; hard-coded dark surfaces or light text are prohibited.
- Shared card components provide a token-driven primary-color hover glow and an independent visible focus state. Feature code must not create one-off glow recipes.
- Shared components support ref forwarding, focus, disabled/loading states, and semantic HTML.
- Feature-specific business logic stays outside primitives.
- Breaking component changes require migration and consumer verification.
## Examples
```tsx
<Button variant="danger" loading={deleting}>Delete account</Button>
```
## Anti-patterns
One-off copies, boolean prop explosions, arbitrary CSS overrides, clickable non-controls.
## Checklist
- [ ] API is focused and token-based.
- [ ] All states, keyboard behavior, and content extremes work.
- [ ] Shared components preserve contrast and state meaning in light and dark themes.
- [ ] Reuse is evidenced by real consumers.

Related: `design.md`, `accessibility.md`, `frontend.md`.
