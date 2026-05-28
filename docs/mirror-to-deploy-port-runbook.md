<!--
Purpose: define the procedure for porting validated content from the public governance mirror (mullusi/mullusi-site) to the private deploy source (mullusi/mullusi-company-site).
Governance scope: content propagation, branch hygiene, classifier-safe sweep execution, validation, and post-merge resync.
Dependencies: gh CLI authed for both repos, both repos locally cloned, node, scripts/build-cloudflare-pages.mjs, scripts/validate-site.mjs.
Invariants: architectural refactors are not ported piecewise; mechanical content sweeps are explicit and reviewable; passive consent does not authorize merge.
-->

# Mirror to Deploy Source Port Runbook

This runbook captures the pattern that proved out during the doctrine
honesty-pass propagation (`mullusi-site#67`/`#68` → `mullusi-company-site#21`/`#25`)
for porting validated content from the public governance mirror to the
private deploy source that Cloudflare Pages builds.

Use it when a content change has landed on `mullusi-site` (the mirror)
and needs to reach `mullusi.com` (served from `mullusi-company-site`).
Merging on the mirror does NOT deploy; the deploy source must carry
the same change.

## When to Use

Use this runbook for:

- i18n string changes (en and am)
- Doctrine and ops gate docs that are public governance evidence
- Wording or honesty refinements that follow a clear mechanical pattern
- Public surface content where the two repos should agree

Do NOT use this runbook for:

- Architectural refactors staged on the mirror (JS modularization,
  product-registry restructures, hero markup wrappers). Those are
  deliberate stagings and deserve a single coordinated port when ready,
  not piecewise content sync.
- Anything where the mirror is intentionally ahead and the deploy
  source lag is the point.

## Preconditions

```text
mirror_repo_clone=present at ~/Projects/mullusi_website
deploy_repo_clone=present at ~/Projects/mullusi-company-site
gh_cli=authed with admin access to both repos
mirror_main=clean and in sync with origin/main
deploy_main=clean and in sync with origin/main
mirror_change=already merged on the mirror
```

## Procedure

### 1. Identify the Scope

Compare current state between the two repos for the specific files
under consideration. Examples:

```bash
PUB=~/Projects/mullusi_website
PRIV=~/Projects/mullusi-company-site

diff "$PUB/data/i18n.json" "$PRIV/data/i18n.json"
grep -l "<old phrase>" "$PRIV/ops/"*.md
```

If the scope spans more than a handful of files, the swap should be a
single mechanical pattern. Resist while-I-am-in-there expansions; they
are how a scoped port becomes a contested PR.

### 2. Branch off Latest Main on the Deploy Source

```bash
cd "$PRIV"
git switch main
git pull --ff-only origin main
git switch -c <descriptive-branch-name>
git status -sb
```

CRITICAL: confirm `git status -sb` shows `## <branch>` based off main
BEFORE editing. The deploy source often has multiple in-flight branches
(`perf/substrate-low-end-bypass` is a real example seen mid-port);
creating a feature branch from an in-flight branch by mistake will
bundle that work into the PR.

### 3. Apply the Change

For per-file Edit (the auto-mode classifier sanctions individual edits),
apply the same identical pattern to each file. Avoid bulk sed sweeps
without explicit user direction naming the specific rename; those get
blocked at the classifier with the message `"Mass in-place modification
of pre-existing shared ops/governance docs ... without explicit user
direction naming this specific rename"`.

For a rename sweep, the explicit pattern to surface is shaped like:

```text
Pattern: "<old phrase>" -> "<new phrase>"
Scope: <N> files under <directory>
Exclusions: <e.g. Completeness: lines, state-machine words>
```

Once that pattern is explicitly named and accepted, run per-file Edit
on each file.

### 4. Validate and Rebuild Dist if Needed

```bash
node scripts/build-cloudflare-pages.mjs
node scripts/validate-site.mjs
```

`dist/` is byte-matched against source for many files. If main was
fast-forwarded during step 2, `dist/` may already be stale even though
the port itself does not touch byte-matched files. Validate will report
`cloudflare_artifact_file_stale:<file>` in that case. Rebuild before
validate to avoid a false negative.

### 5. Commit, Push, Open PR

```bash
git add <specific tracked files>
git commit -m "..."
git push -u origin <branch>
gh pr create --repo mullusi/mullusi-company-site --base main --head <branch> \
  --title "..." --body "..."
```

Avoid `git add ops/*.md` if any ops files are gitignored
(`recovery-inventory.private.md` is one such file). The error message
will list the ignored file; add the rest explicitly.

### 6. Hand off the Merge Command

Passive consent ("continue", "go", "yes") does NOT authorize
`gh pr merge`; the auto-mode classifier blocks it. Surface the explicit
merge command for the user to run:

```bash
gh pr merge <N> --squash --delete-branch --repo mullusi/mullusi-company-site
```

Confirm CI is green BEFORE surfacing the merge command. The user merges
within seconds of being handed the command; surfacing it before CI
passes can land a stale or broken state.

### 7. Post-Merge Resync

After the user merges:

```bash
git fetch origin
git switch main
git reset --hard origin/main
git branch -D <feature-branch>
```

`reset --hard` is needed because PRs land as squash commits, so local
`main` is no longer an ancestor of `origin/main` and `merge --ff-only`
will fail. The squashed commit on `origin/main` contains the same
content; no work is lost. The remote feature branch auto-deletes on
merge.

## Known Caveats

| Caveat | Symptom | Fix |
| --- | --- | --- |
| Squash divergence | `git merge --ff-only` fails after merge; local main has the pre-squash commit | `git reset --hard origin/main` with a clean working tree |
| Dist staleness | `validate-site` reports `cloudflare_artifact_file_stale:<file>` | `node scripts/build-cloudflare-pages.mjs` then revalidate |
| Branch-off-wrong-branch | New PR shows commits from an unrelated in-flight branch | Switch to main, pull, then recreate the feature branch |
| Gitignored files in glob | `git add ops/*.md` fails with "paths are ignored" | Add tracked files explicitly |
| Classifier block on sweeps | Bash with `sed -i` denied with "without explicit user direction naming this specific rename" | Use per-file Edit and explicitly name the rename pattern before sweeping |
| Parallel user work | Mid-edit branch swaps; in-flight working-tree edits get carried into someone else's commit | Commit and push promptly; do not sit on uncommitted edits across many tool calls |
| Hero rail i18n shipping under another commit | Working-tree edits captured by a parallel branch swap; original PR ends up redundant | Confirmation post hoc; the content still lands, just under another commit. Resync local main, drop the local branch, move on |

## Examples

| Port | Mirror PR | Deploy PR | Pattern |
| --- | --- | --- | --- |
| Hero rail i18n to Amharic | `mullusi-site#67` | `mullusi-company-site#21` | Per-key i18n string replacement, en and am, identical translations both repos |
| Doctrine honesty STATUS sweep | `mullusi-site#68` | `mullusi-company-site#25` | `"Invariants verified:" -> "Self-attested invariants:"` across all ops gate docs |

STATUS:
  Completeness: 100%
  Self-attested invariants: scope discipline (content-only ports), branch hygiene named, classifier-safe sweep pattern named, squash-resync named, dist-staleness named, hand-off-merge-not-self-merge discipline preserved
  Open issues: none
  Next action: apply before the next mirror to deploy source port
