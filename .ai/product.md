# Litera Product Brief

## Purpose
Litera is a stable, Swahili-first workspace for turning educational source books into responsive, accessible, narratable web and offline learning packages.

## Primary users
- Content specialists who map source pages and correct extracted content.
- Inclusive-design reviewers who verify reading order, alternatives, and learner interactions.
- Language reviewers who listen to and approve Tanzanian Swahili narration.
- Publishers who package and release a validated book without overwriting local work.

## Product promise
The shortest trustworthy path from source book to an inclusive digital publication. Every page remains visually traceable to its source, every edit is reversible, and every release is supported by evidence.

## Core workflow
1. Import a source and create a page inventory.
2. Build each page from semantic content blocks in a direct-manipulation storyboard.
3. Review source fidelity, accessibility, responsiveness, and narration in context.
4. Generate speech at entity level, listen, edit pronunciation, and regenerate only affected items.
5. Publish only from a clean, validated version; expose failures with actionable details.

## Non-negotiable capabilities
- Block-based storyboard with keyboard-equivalent move, resize, group, undo, and version history.
- Source/page split view and explicit coverage accounting.
- Swahili speech review using normalized spoken text, pronunciation overrides, voice provenance, confidence flags, and per-item regeneration.
- Offline-first learner output and standards-based package export.
- WCAG 2.2 AA authoring UI and generated content.
- Responsive previews at 320, 768, and 1440 CSS pixels with overflow detection.
- Safe publication: never synchronize over uncommitted work, sequence stages, bound retries, and preserve rollback points.

## Success measures
- Median time from import to first editable page under 60 seconds for a representative source.
- Storyboard interaction response under 100 ms at p75 with 250 blocks loaded.
- No unreviewed speech item can be marked release-ready.
- Zero missing source pages, response anchors, narration mappings, or package assets at release.
- A new trained content specialist can complete the primary page workflow without developer assistance.

## Initial scope
The first vertical slice proves the application shell, page/block storyboard, page quality panel, theme system, and Swahili speech-review entry point. Import, persistence, collaborative editing, real speech generation, and package export follow behind stable domain interfaces.
