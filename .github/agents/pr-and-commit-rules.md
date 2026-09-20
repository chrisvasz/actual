# PR and Commit Rules for AI Agents

This file lists the PR and commit rules you have to apply yourself.

## Pull Request Rules

### `[AI]` prefix on PR titles

**ALL pull request titles MUST be prefixed with `[AI]`** — you have to apply it
yourself.

**Examples:**

- `[AI] Fix type error in account validation`
- `Fix type error in account validation` (MISSING PREFIX — NOT ALLOWED)

### Write the PR body yourself

**Write a concise summary of the change as the PR body** — don't use the PR
template, and don't leave the body empty.

- Cover **what changed**, **why**, and anything a reviewer should know (a
  trade-off, a follow-up, a deliberate omission).
- Keep it short and plain: a couple of sentences, or a few bullets for a change
  that touches several things.
- No template, no checklist, no filler sections — skip headings like "Testing"
  or "Related issue(s)" unless you actually have something to say there.
- Describe only what you did. Don't claim testing or verification you didn't
  perform.

`.github/PULL_REQUEST_TEMPLATE.md` still exists for human contributors; it just
isn't the starting point for a PR you open.

## Do not create GitHub issues

**Agents must never create GitHub issues.** Filing an issue is a human
decision — neither the GitHub MCP tools (`issue_write` with method `create`)
nor the `gh` CLI (`gh issue create`) may be used to open one; agent hooks
block both. If you believe an issue should exist, share the proposed title
and body with the user and let them file it. Updating existing issues (and
commenting on them) remains allowed.

## GitHub comment, review and issue prefix

**Prefix everything you post to GitHub with the robot emoji 🤖** — pull-request
and issue comments, pull-request reviews (including inline review comments), and
the title and body of issues you edit. This keeps agent-authored content
visibly marked. It does **not** change PR titles (still `[AI] …`) or commit
messages (still `[AI] …`).

Write the text normally; just make sure 🤖 is the first character (for issues,
on both the title and the body).

This applies only to comments **you** author — bots like CodeRabbit post under
their own identity and are not affected.
