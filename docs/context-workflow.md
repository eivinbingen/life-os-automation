# Issue-focused context

## Start a fresh implementation chat

Use the development repository/isolated worktree for one issue. Include the issue
link and implementation mode; do not fork or paste the entire product-planning
conversation merely to provide background.

Suggested prompt:

> Implement issue #NUMBER: ISSUE_URL. Read applicable AGENTS.md files, the issue,
> and relevant code. Read supporting document sections only when needed. Follow
> the issue's implementation mode and repository delivery workflow.

For a learning exercise:

> Work through issue #NUMBER with me. I write the designated code; coach one step
> at a time and include me in every unresolved design decision.

The [documentation index](README.md) routes references. Acceptance criteria,
exclusions, integration-write bounds and behavior-specific verification belong in
the issue. Durable rules belong in AGENTS.md. Shared product contracts belong in
the relevant design document. Avoid repeating the same full requirements in each.

## During work

Search relevant symbols/sections before reading whole files. Keep outputs bounded;
summarize discoveries instead of repeatedly dumping docs, schemas or test logs.
Read dependency issues only when their contracts matter. Record a necessary new
decision in its authoritative issue/document rather than preserving only a chat.

If requirements conflict, resolve that conflict explicitly; a stale status note
does not override current code or the issue's agreed behavior. A planned native
rule does not authorize changing current Notion writes.

## Compact handoff

For unfinished work, record:

- Issue, implementation mode, checkout and branch.
- Completed work and essential file references.
- New decisions not already recorded in the issue/document.
- Verification results and unresolved failures.
- Next action and blockers.
- Existing changes to preserve.

Aim for a few hundred words. Link to contracts rather than copying their full text.
Keep personal source data out. A fresh continuation chat can use this handoff and
inspect the checkout without inheriting the full transcript.

## Verify improvement

For the next issue, note the starting instruction sources, whether unrelated docs
are read, and whether the slice finishes before context pressure interrupts it.
This cleanup reduces unnecessary project reading; it does not remove app-supplied
instructions/tool catalogs or establish a measured speedup. Use observed results
to decide whether further changes are necessary.
