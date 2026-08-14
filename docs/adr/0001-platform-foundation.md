# ADR 0001: Platform foundation

## Status
Accepted — 2026-08-14

## Context
Litera needs a responsive visual authoring tool, deterministic publishing workflows, background media jobs, and replaceable speech/storage providers. Product complexity must remain low enough for a small team to operate reliably.

## Decision
Start as a TypeScript modular monolith. The web application uses Next.js App Router, React Server Components by default, Tailwind CSS, and owned shadcn/Radix primitives. Business capabilities will be colocated under `apps/web/src/features`; domain rules must remain independent of React and provider SDKs.

PostgreSQL will be the system of record when persistence is introduced. Object media will use an S3-compatible adapter. Long-running conversion and speech work will use durable, idempotent jobs rather than HTTP request lifetimes. Speech providers sit behind a port that accepts visible text, normalized spoken text, locale, voice, and pronunciation overrides and returns provenance plus quality metadata.

## Consequences
- One deployable application keeps local development, transactions, and releases understandable.
- Provider-specific code cannot leak into storyboard or publishing domain logic.
- Service extraction remains possible if measured load or ownership boundaries justify it.
- Real-time collaboration is deferred until single-user persistence and version history are proven.

## Performance budgets
- Storyboard input feedback: p75 below 100 ms with 250 visible blocks.
- Initial meaningful render: p75 LCP below 2.5 seconds on representative mid-tier mobile hardware.
- Layout stability: CLS below 0.1.
- Initial client JavaScript: target below 180 kB gzip for the storyboard route, excluding editor features loaded on demand.
- Conversion and speech queues must be bounded, resumable, observable, and safe to retry.
