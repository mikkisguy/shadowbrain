# Pull Request Workflow

The end-to-end flow for taking a triaged issue (or in-place fix on an existing
PR) to a green PR ready for human review. The pre-PR walkthrough is the
[Review Checklist](review-checklist.md).

**Default flow for triaged issues: start on a fresh branch from `main`.**
When you begin work on a triaged issue, do not commit on whatever
branch is currently checked out. Instead:

1. `git checkout main`
2. `git pull origin main` (or `git pull` if `main` already tracks
   `origin/main`)
3. Create a branch named after the issue, e.g. `issue/<#>-<slug>`
   (e.g. `issue/123-rate-limit-auth`).
4. Implement the issue on that branch.

**Exception: in-place fixes on an existing PR.** If a PR is already
open for the work — including subsequent review iterations on the
same issue (checklist fixes, `@oracle` findings, CI failures) — push
to the same branch and PR. "Scope discipline" means "do not mix
unrelated changes into a PR" — it does not mean "always split
ad-hoc fixes into a new branch and PR." Only create a new branch
and PR when the developer explicitly says so, or when the work is
for a separate, distinct issue that has been triaged in the issue
tracker.

When the issue assigned to you is implemented and locally verified
(`pnpm verify` is green), take the work through to a PR that is green
and ready for human review. Use the `gh` CLI for all GitHub
interactions. **Never merge the PR yourself — merging is a developer
decision.**

**Flow:**

1. **Self-review with the [Review Checklist](review-checklist.md).** Walk
   through it. Fix anything you find before committing.
2. **Sensitive or high-risk diffs: delegate to `@oracle` before
   opening the PR.** Use the `@oracle` specialist for a strategic +
   security review pass if **any** of the following is true:
   - The diff touches auth, sessions, rate limiting, secrets, or
     security boundaries.
   - The diff touches the database layer (schema, migrations,
     query helpers, audit log).
   - The diff adds or changes an API route, route handler, or
     proxy.
   - The diff is large (rule of thumb: > 200 changed lines, or any
     single file > 100 changed lines).
   - You are uncertain about an architectural choice.

   Documentation-only changes (typo fixes, formatting, doc rewording
   with no security or architectural impact) are exempt from the size
   and category triggers above — only route to `@oracle` if the doc
   change is itself a security/architectural decision.

   Pass to `@oracle`: the issue reference, the full diff, the list of
   files touched, and a one-line description of intent. Address every
   `must-fix` and `should-fix` finding on the branch, then re-delegate
   to `@oracle` with the updated diff. **Loop until `@oracle` reports
   no remaining must-fix or should-fix findings** — only then proceed
   to open the PR. Any item you intentionally defer must be called
   out in the PR body with a one-line justification; silently skipping
   a finding is not acceptable.

3. **Stage and commit** only the intended files. Inspect `git status`
   and `git diff` first; never commit secrets. Write a concise commit
   message that matches the repo style (look at recent
   `git log --oneline -10`).
4. **Push** the branch: `git push -u origin <branch>`.
5. **Open a PR** with `gh`:
   ```bash
   gh pr create \
     --base <base-branch> \
     --title "<short summary>" \
     --body "<issue reference + what changed + how it was verified + @oracle verdict if applicable>"
   ```
   Reference the issue (`Closes #N` or `Fixes #N`) in the body so
   merging the PR closes the issue.
6. **Watch status checks**: `gh pr checks --watch` (or poll with
   `gh pr view <pr> --json statusCheckRollup`). If a check fails, read
   the logs, fix the underlying cause on the branch, commit, push, and
   re-watch. Keep iterating until all required checks are green.
7. **Stop and hand off** when checks are green. Do not run
   `gh pr merge`, do not enable auto-merge, do not dismiss reviews. The
   developer reviews and merges.

**Constraints:**

- One PR per issue, scoped tightly. If scope grows, split it into a
  follow-up.
- If a check looks flaky or transient, rerun it
  (`gh pr checks <id> --rerun`) only after confirming the failure is
  not caused by your change.
- Do not force-push after a review has started unless explicitly asked.
- If you are blocked by something only a human can resolve (missing
  credentials, protected-branch permissions, ambiguous requirements),
  stop and report the blocker instead of guessing.
