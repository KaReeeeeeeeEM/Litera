# Documentation
## Purpose
Preserve the context needed to use, operate, and evolve the system.
## Philosophy
Document decisions and contracts near their owners. Prefer concise, tested, maintained guidance over exhaustive prose.
## Best Practices
- Maintain setup, architecture map, API contracts, runbooks, and ADRs.
- Include rationale, alternatives, consequences, owner, and review date for durable decisions.
- Keep examples executable or verified where practical.

### Documentation Page Standard

- When the Reelma Pay documentation project or page is available, inspect it before designing documentation. Record its reusable layout, navigation, typography, code-example, spacing, and responsive patterns; preserve those patterns unless accessibility or this handbook requires improvement. Never invent details about an inaccessible reference.
- Use a stable three-region shell on desktop: product/docs navigation, a readable article column, and an on-this-page table of contents for long articles. Collapse secondary navigation into accessible drawers on small screens.
- Keep the desktop documentation side navigation sticky beneath the global header and let the document own vertical scrolling; do not add an independently scrolling navigation rail unless its content cannot fit the viewport.
- Highlight the side-navigation item for the article section currently in view, update it as the reader scrolls or follows a hash link, and expose the state with `aria-current="location"` rather than color alone.
- Start every page with breadcrumb context, one precise H1, a short outcome-oriented summary, and optional metadata such as product area, version, or last update.
- Structure task documentation as prerequisites, numbered procedure, expected result, verification, troubleshooting, and next steps. Concept pages should move from mental model to examples and edge cases.
- Keep prose measure near 65–80 characters. Use generous vertical rhythm, visible heading anchors, restrained dividers, and distinct surfaces for notes, warnings, success states, and dangerous operations.
- Code blocks identify language, support copy, wrap or scroll safely, and show realistic complete examples. Pair requests with responses and explain placeholders.
- Code blocks, terminals, inline code, callouts, and copy controls use semantic theme tokens and are explicitly reviewed in both light and dark modes.
- Anchor navigation scrolls smoothly by default, preserves a header offset, and falls back to immediate movement when `prefers-reduced-motion` is enabled.
- Navigation, headings, search, table of contents, copy actions, and code examples must work with keyboard and screen readers. Meet `accessibility.md` and `responsiveness.md`.
- Documentation search prioritizes exact titles, commands, error codes, and headings; the empty state suggests navigation and support paths.
- Show version applicability and last-reviewed date where behavior can drift. Broken links, unowned pages, and stale examples fail CI or scheduled review.
## Rules
- Behavioral/configuration changes update docs in the same change.
- Never duplicate an authoritative rule; link to it.
- Remove stale guidance rather than adding contradictory notes.
- A documentation page is not complete without mobile navigation, deep-linkable headings, designed code/callout states, SEO metadata, and a clear next action.
- Each primary side-navigation concept owns a stable route rather than only an in-page anchor. Every article provides contextual previous and next navigation.
- Installation documentation must complete the journey for every supported operating system and distribution surface, including prerequisites, CLI/global/npx paths, desktop installation, verification, expected results, and troubleshooting.
## Examples
```text
docs/adr/0023-use-outbox.md: Context → Decision → Consequences → Status
```

```text
Getting started: Goal → Prerequisites → Install → Configure → Verify → Troubleshoot → Next step
```
## Anti-patterns
Undated diagrams, setup steps that skip prerequisites, comments narrating code, giant unstructured articles, floating table-of-contents widgets that obscure content, and screenshots used instead of copyable instructions.
## Checklist
- [ ] Audience, owner, and source of truth are clear.
- [ ] Commands, links, and examples work.
- [ ] Decisions and operational recovery are documented.
- [ ] Documentation pages match the approved reference language, including Reelma Pay when accessible.
- [ ] Navigation, anchors, search, callouts, code blocks, mobile layout, and next steps are complete.
- [ ] The desktop side navigation stays visible without creating a competing scroll container.
- [ ] The active article section and its side-navigation state stay synchronized while scrolling and following deep links.
- [ ] Light/dark code surfaces and reduced-motion anchor scrolling are verified.

Related: `AGENTS.md`, `api.md`, `monitoring.md`.
