# Documentation index

Start with the assigned issue, applicable AGENTS.md, and relevant code. These are
references to consult when needed, not a startup reading list. Issues own slice
acceptance criteria; documents own reusable contracts. A future design does not
change the current backend's behavior until implementation/cutover.

| Need | Read |
| --- | --- |
| Start the app or run checks | [Repository README](../README.md) |
| Delivery rules and learning ownership | [AGENTS.md](../AGENTS.md) |
| Fresh chat or compact handoff | [Context workflow](context-workflow.md) |
| Delivery order | [Roadmap](roadmap.md) |
| Product discovery | [Product vision](product-vision.md) |
| Layering, current storage, planned transition | Relevant section of [Architecture](architecture.md) |
| Entity concepts/current versus native rules | Relevant section of [Domain model](domain-model.md) |
| Review stage behavior | Matching stage of [Weekly Review V2](weekly-review-v2.md) |
| Review save/retry/backup contract | [Review recovery](weekly-review-v2.md#save-conflicts-and-recovery-contract) |
| Notion goal/project/area adapter or import | [Dated schema evidence](notion-goals-schema.md) and current adapter |
| Notion course adapter or import | [Dated course evidence](notion-courses-schema.md) and current adapter |
| Source-to-native gaps and follow-up ownership | [Migration inventory](native-migration-inventory.md) |
| Native migration decisions | Relevant section of [#60](https://github.com/eivinbingen/life-os-automation/issues/60) |
| Frontend checks/conventions | [Frontend README](../apps/web/README.md), [frontend AGENTS.md](../apps/web/AGENTS.md), relevant bundled Next.js guide |

## Relevance audit — 2026-10-02

Reviewed every tracked Markdown document plus the issue template against main
`fef4af1`, open issues and PRs. No app behavior, live schema or personal data was
changed. Status is a dated observation, not a substitute for current issue/code checks.

| File | Decision and reason |
| --- | --- |
| Root README | Keep/update: operational setup; replace read-only/V1 claims with shipped surfaces and current JSON path |
| Root AGENTS.md | Keep/update: concise durable boundaries and selective reading; remove stale Today-only priority |
| Product vision | Keep/condense: purpose/principles; remove repeated roadmap and outdated Notion-readiness test |
| Roadmap | Keep/update: shipped/current/next/later, native migration before full Studies; project write code exists despite open #45 |
| Architecture | Keep/condense: real code map and current owners; separate current JSON from agreed future SQLite; remove speculative endpoints/tree |
| Domain model | Keep/update: source-independent concepts, explicit current/native separation; no unsupported claim that Projects lack Goal |
| Weekly Review V2 | Keep/update: stage and recovery contracts still relevant; remove obsolete preimplementation dependencies and transitional delivery narrative |
| Notion goals schema | Keep/condense: retain dated property evidence; replace contradictory write guidance with current two-sided behavior and require import reconciliation |
| Notion courses schema | Keep/annotate: import/adapter evidence; not a universal native model contract |
| Frontend README | Replace boilerplate with Life OS commands, API boundary and selective references |
| Frontend AGENTS.md | Keep unchanged: generated Next.js guidance; read only relevant framework documentation |
| Frontend CLAUDE.md | Keep unchanged: one-line instruction reference; negligible duplication |
| PR template | Keep unchanged: short review/verification structure; useful delivery artifact |
| Issue template | Keep/update: scope-specific context and section links rather than repeated global rules |

No useful document was deleted solely to reduce context. Historical source evidence
is still available, while issues and code resolve current requirements. This audit
does not establish why earlier agents exhausted context: tool/app guidance, inherited
chat history, repeated reads and large outputs may also contribute.

## Design-finalization follow-up

After PR #66 merged, #29 is delivered and Today #19/#20 are deferred rather than
migration prerequisites. [The migration inventory](native-migration-inventory.md)
verifies current code/detailed source evidence and assigns exact import/recovery
work to #62/#64. The audit table above remains a record of its original baseline.
