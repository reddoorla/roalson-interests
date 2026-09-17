# CLAUDE.md

Session rules for AI agents working a Reddoor site repo. This file ships with
the template, so every site generated from it starts with these rules.

## Before you push

```bash
pnpm verify
```

That is exactly what CI runs, in CI's order (prettier → eslint → svelte-check →
build → axe audit → unit + smoke). Run it instead of guessing which subset
matters — a red CI on a site repo costs a round trip through review.

Formatting is enforced on `.svelte` files too: the plugin loads from
`.prettierrc`, not from a CLI flag. Don't reintroduce `--plugin` to the `lint`
script — with no config file, `prettier --check .` silently skips every
`.svelte` file, and that is exactly the hole the config closes.

## Concurrent sessions

Site repos generally get **one** agent session at a time — but central
fleet-maintenance sessions (reddoor-maintenance) also open PRs here, so:

- **Check for an existing fix before starting one.** Look for fresh `fix/*`
  branches and open or just-merged PRs addressing the same signal — a fleet
  session may already have been dispatched for it. A duplicate fix gets
  closed as superseded, never merged.
- **Re-verify after any pause.** After a session-limit pause, compaction, or
  long gap: `git log --oneline -3` and `git status` before committing, and
  re-confirm the PR head SHA before merging.
- **If sessions must run concurrently** (rare), each works in its own git
  worktree — never commit from a checkout another session may be using.
- **Check a PR's real changed-file list before merging.** Fleet branches can be
  stacked on another open PR and drag it onto main.

## The work journal

**Every working session appends a dated entry to `docs/workJournal.md`** — what
was done and **why**, newest at the bottom, never corrected in place. Write it
as the last act of the session, not the first act of the next one.

The journal is the history of executing the build. Code says what the system
does now; the journal says what it used to do, what it cost to change, and
which beliefs turned out to be wrong. Nearly everything expensive to rediscover
lives there and nowhere else.

An entry is headed with the date, a short title, and where it landed:

```markdown
## 2026-09-04 — Both runway stages render their final frame without JS (#51, `ce46ae0`)
```

Then prose — not a bullet list of file names, which the diff already tells you.
What to put in, in rough order of value:

- **Why, over what.** The reason a thing was done survives; the diff does not
  need restating.
- **Measured numbers, exactly.** "The comp's open mask is 2696×2352 on an 860px
  band — 2.735× the band's height, so a 390×664 phone needs ~534%" is worth
  keeping. "Fixed the hero on mobile" is not.
- **Defects, named.** What broke, what it looked like, and what made it
  invisible until it wasn't.
- **What was tried and abandoned**, and what it would take to revive it. A dead
  end nobody wrote down gets walked twice.
- **Beliefs corrected on contact.** The design assumption that turned out false
  is usually the most valuable line in the entry.
- **Honest accounting.** If a win came from somewhere other than the change
  that claimed it, say so — that is exactly what someone will otherwise
  over-invest in next.

**History is never edited to be right.** An entry that stops being true is not
rewritten; a later entry corrects it, and says which one it corrects. The
journal is a record of what was believed at the time, and that record is most
useful precisely where it was wrong. Fixing the past in place destroys the only
evidence of how the mistake was made.

The one edit an old entry may take is a **forward pointer**: one line directly
under its heading naming the entry that overturned it — `> Superseded in part by
2026-10-14 — <that entry's title>.` It asserts nothing new and retracts nothing,
so the record of what was believed survives whole; it only stops a reader who
lands on the old paragraph from leaving with the old answer. Without it the rule
above is half a mechanism: the correction exists at the bottom of the file, and
nothing points to it from where a reader actually arrives.

If a session produced nothing worth an entry, that is itself worth one line.

## Six rules that came from shipping a site

Each of these is a defect class that shipped on a real build, not a preference.
They are stated as rules because in every case the reasoning was available at the
time and did not get applied.

### A pass needs positive evidence — never the absence of an error

The single most expensive pattern. A green must require an artifact only a
working system produces: a 2xx for the script that makes the widget, a minted
token, a real submission traced end to end. **An error matcher may only ever DENY
a green**, never grant one.

Worked example, because the shape is slippery. A site's `/health` reported
`turnstile: true` — a truthiness check on an env var that never contacts
Cloudflare — and that boolean was allowed to mean "the widget works". The fix
required a mount point in the DOM, which the component server-renders whenever
the env var is set. The next fix required Cloudflare's script to load, which it
does regardless of whether the sitekey is valid. Each correction reintroduced the
same shape one step along, and the last survived by exactly one error code.

Corollary: **a field that can only observe configuration must never be named
after the thing it cannot observe.**

### Enumerate the defect class before fixing an instance

When a defect is found, the next question is _what else is in this class_ —
every value a script supplies, every string the CMS does not write, every
`%sveltekit.*%` placeholder — then fix once. Fixing instances one at a time
shipped four PRs for no-JS (three of them inside 69 minutes, each merged
believing it had closed the class), four for a second locale, and the same
template-placeholder bug twice in one hour, the second time in the act of
documenting the first.

### A claim about what the tests cover is a claim about code

So it must be made by reading that code. Three claims about a probe's behaviour
were written and found false within 24 hours, including one asserting it swapped
a sitekey when nothing in it wrote `data-sitekey` at all. **Documentation written
in the same session as the fix is a hypothesis, not a record.**

Two things follow:

- **Write the test that fails for the reason you think it fails, by breaking the
  thing on purpose.** A guard that names a class in its selector passes a rename
  happily — the class stops matching, so the test measures one element and finds
  one. Mutate, watch it go red, then keep it.
- **Check what the shared harness forces.** `playwright-a11y` sets
  `contextOptions.reducedMotion: "reduce"` on every test, which made a whole
  class of new no-JS tests vacuous while they passed.

### Read the inventory before writing behaviour

`docs/COMPONENTS.md` is generated from `src/lib` and lists every shared module
with its real prop/export names and test count. Read it before writing
interactive behaviour into a slice — a carousel, a dialog, a disclosure, a focus
trap, a reduced-motion check.

This is not "check for existing work" restated. That instruction was already in
this file and did not stop three re-derivations in two days on one site:
`Slider.svelte` rebuilt as a slice-local carousel, `actions/trapFocus.ts` as six
hand-rolled dialogs, and `transitions.ts`'s `prefersReducedMotion` copied
verbatim into two slices. Every session had read CLAUDE.md. The instruction was
never the missing piece — the DATA was. Nothing anywhere put the string
`Slider.svelte` next to the word "carousel".

So it is a list, not a gate, and deliberately so. A check that fails in CI fires
after the component is written: the hour is already spent and all it saves is
the merge. It has to be read before the decision or it does nothing.

**Reuse is not always the answer.** A component whose markup fights the design is
a reason to lift its logic, not to reach for it whole — and on a site with a
matching harness, the geometry gate diffs slice DOM against transcribed reference
markup, so a shared component often cannot be dropped in at all. That is an
argument against reusing the component and never against reading it. Where you
decline one, say which and why: in `matching/LEDGER.md` on a matching site, in
the journal otherwise.

**Regenerate** with `node scripts/capability-index.mjs` after adding or changing
anything under `src/lib`. `scripts/capability-index.test.ts` fails when the index
is stale — that guard is retroactive on purpose, because it protects the index
rather than the decision.

**Optional, and the part that fires first.** `scripts/hooks/reuse-context.mjs` is
a `UserPromptSubmit` hook: given a request naming behaviour this repo ships, it
prints the matching rows before the agent plans. It never blocks a tool call —
one false refusal makes the whole mechanism something to route around. Enable it
with a `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/hooks/reuse-context.mjs\""
          }
        ]
      }
    ]
  }
}
```

`.claude/` is gitignored here and machine-wide on at least one maintainer's
setup, so that file is per-checkout until someone decides otherwise.

### Anything found and not fixed in the same PR gets an issue

A code comment is not a tracker and a doc correction is not a fix. The a11y gate
gap was correctly diagnosed and written up as a documentation correction; the
real fix was eight strings in `package.json` and waited two more days. A note
about unlicensed placeholder photography lived in a code comment for four days
and became the largest launch blocker, because it was in neither an issue nor
the "what is NOT done" list — the two places a launch sweep reads.

### Verify on a production build

Some defects are not merely invisible on the dev server — it **actively hides**
them. Both scroll-driven runway stages rendered correctly under `vite dev` and
frame 0 in the shipped bundle. Fonts load by a different CSP directive in dev
than in prod, so a CSP assertion exercised against `pnpm dev` proves nothing
about the shipped path. `pnpm build && pnpm preview` before believing a
CSP, font, hydration or no-JS result.

### Branch per batch, and keep in-flight state where it survives the session

Two deterministic losses, neither a judgment call: a PR squash-merged while
commits were still landing on its branch orphaned them silently, with no CI and
nothing on main; and a PR stacked on another PR's branch was auto-closed when
that base was deleted, and **a closed PR whose base is gone cannot be reopened**.

Branch each batch off `main`. And when work is in flight across a pause — a
session limit, a compaction, a crash — the journal entry is what survives it.

## Orientation

| Looking for                       | Go to                                                                       |
| --------------------------------- | --------------------------------------------------------------------------- |
| **Behaviour that already exists** | **[docs/COMPONENTS.md](docs/COMPONENTS.md) — read before writing any**      |
|                                   | **interactive behaviour into a slice**                                      |
| What this stack ships             | [docs/STARTER.md](docs/STARTER.md)                                          |
| What's still a template default   | [docs/NEW-SITE.md](docs/NEW-SITE.md)                                        |
| A11y conventions and the axe gate | [docs/accessibility.md](docs/accessibility.md)                              |
| CSP, headers, form anti-bot       | [docs/security.md](docs/security.md)                                        |
| Page rendering                    | `src/routes/[[preview=preview]]/[uid]/+page.server.ts` → `$lib/page-load`   |
| Prismic slices                    | `src/lib/slices/<Name>/` — `model.json`, `mocks.json`, `index.svelte`, test |
| Brand tokens                      | `src/app.css` `@theme` block                                                |
| Measuring the build vs the comp   | `scripts/figma-compare/` — stand it up at Stage A, before the first slice   |
| What this session did, and why    | `docs/workJournal.md`                                                       |
| Rebuilding from a live site       | reddoor-maintenance `webflow` + `match-harness`, the matching-a-page skill  |

## Traps

- **`src/lib/slices/index.js` and `src/prismicio-types.d.ts` are generated** by
  Slice Machine. Regenerating overwrites curated `mocks.json` content with
  lorem — re-curate after any regen, and check Number fields didn't come back
  as strings.
- **The `your-prismic-repo-name` sentinel is load-bearing.** It keeps a
  clone's build green before the CMS exists. See docs/NEW-SITE.md.
- **`RepositoryNotFoundError` extends `NotFoundError`.** Catching `NotFoundError`
  to serve a 404 will silently swallow a misconfigured repository name.
- **Never hand-roll `scrollTo`** — use `$lib/utils/instantNavScroll`.
- **Never redraw an asset in CSS** when the real file is downloadable. Ship the
  file.
