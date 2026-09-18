# Roalson Interests — Work Journal

Running log of build work: what was done, why, and where it landed.
Chronological — newest entry at the bottom. [STARTER.md](STARTER.md) says what
the stack ships; this is the history of getting it there.

**The entries dated before 2026-09-17 are inherited from `reddoor-starter`**, the
template this site was generated from. They were kept on purpose rather than
deleted: they are the only record of why this stack prerenders the way it does,
why the `your-prismic-repo-name` sentinel exists, why the CSP grants
`unsafe-hashes` for exactly one Svelte handler, and why the a11y gate's route
list is what it is. Every one of those decisions still governs this repo, and
each was expensive to reach. Entries from the bootstrap onward are this site's.

The convention is in [CLAUDE.md](../CLAUDE.md) under "The work journal". In
short: every working session appends a dated entry, prose over bullets, why
over what, and history is never edited to be right — a later entry corrects an
earlier one and says so.

---

## 2026-09-05 — Journal opened, and 280 commits of history summarised rather than reconstructed (`chore/work-journal`)

> Superseded in part by 2026-09-08 — The Webflow rebuild pipeline has a home,
> and it is not this repo.

The journal starts today, so this first entry is a **backfill**: a deliberately
coarse summary of what came before, written from the commit log rather than
from memory. Detail below this line is trustworthy; detail above it is not, and
nothing here should be cited as though someone wrote it down at the time. The
commit log remains the record for anything before 2026-09-05.

**What this repo is.** A forkable SvelteKit 2 / Svelte 5 / Tailwind v4 /
Prismic starting point for every site Reddoor builds, deployed on Netlify. 280
commits from `initial` on 2024-02-22 to here — 72 in 2024, 68 in 2025, 140 in
2026, which is the shape of a template that stopped being a side project once
sites started shipping from it.

**The eras, roughly.** 2024 and 2025 are the slow build of the stack itself.
2026 is where the volume is, and it clusters: **July alone carries 61 commits**,
mostly the Blux migration track — a frozen-render pipeline for pixel-faithful
migration of an existing catalog site, proven on `the-pointe-burbank` and then
upstreamed (#78, #81–#84, #88, #89). That layer was snapshotted out to
[reddoor-starter-blux](https://github.com/reddoorla/reddoor-starter-blux) on
2026-08-31 as forward-merge-only, so this repo keeps the general case and the
Blux specifics live next door. August and September are consolidation: the
shared configs adopted so sync drift went to zero (#110), Prismic srcset widths
capped with a real `sizes` on every image (#109), and `Testimonial` and
`CtaBanner` added to the slice library, taking it to nine.

**One trap worth pulling forward, because it recurred downstream.** #74
(2026-07-18) reworded a comment in `src/app.html` so that `%sveltekit.body%`
was not trapped inside it — SvelteKit substitutes the **first** occurrence of a
placeholder and only the first, so merely _mentioning_ one in prose consumes
it. The fix was correct and it held. The lesson did not generalise: on
2026-09-04 the Vida Legacy Foundation site shipped the identical defect against
`%sveltekit.head%` **twice in one hour**, the second time while writing the
explanation of the first. A fix that lands in one repo as a one-line reword,
with no test and no note that the whole placeholder _family_ is affected, is a
fix that gets to happen again. That is a large part of why this journal exists.

**State as of this entry.** `main` at `2377e9c`, CI green. Nine shared slices,
each with `model.json`, `mocks.json` and a vitest suite. The `pnpm verify`
gate runs prettier → eslint → svelte-check → build → axe → unit + smoke, which
is exactly CI's order. `docs/NEW-SITE.md` lists what is still a template
default in a fresh clone.

**What changed today.** `CLAUDE.md` gained "The work journal", and this file
exists. Because this file ships with the template, every site generated from
the starter now starts with the convention rather than acquiring it later —
which was the actual gap: Vida Legacy Foundation accumulated four days of
hard-won detail in `CLAUDE.md` prose and PR bodies, where it is real but
unordered, because there was nowhere chronological to put it.

## 2026-09-05 — Ten retrospective rules made into defaults, and the half of the journal rule that was missing (#115, `15abd0d`)

Two changes, a few hours apart, and the second exists because a research pass
went looking for what the first got wrong.

**The ten rules landed (#115).** `scripts/figma-compare/` is now in the template
rather than in one site's repo, `package.json` ships
`reddoor.a11yRoutes: ["/"]` so a clone's axe gate measures a real page from the
first commit instead of only `/dev/a11y-fixtures`, and `CLAUDE.md` gained "Six
rules that came from shipping a site". The provenance of all ten is Vida Legacy
Foundation's `docs/workJournal.md`, written the same week.

**And the journal rule turned out to be half a mechanism.** It says an entry
that stops being true is never rewritten — a later entry corrects it and names
which one. That is right, and on its own it fails at the only moment it
matters. The correction goes to the bottom of the file. A reader searching for
"sticky band" or "Turnstile" lands in the middle, on the superseded paragraph,
and leaves with the answer that was already known to be wrong. Nothing in the
old entry points forward, because the rule forbade touching it.

So: one line under a superseded heading, `> Superseded in part by <date> —
<title>.` It asserts nothing and retracts nothing, so the record of what was
believed at the time survives whole; it only redirects. The distinction that
makes it safe is that a pointer is *navigation*, not *content* — the prohibition
is on editing the claim, and a pointer makes no claim.

The evidence it was needed showed up by accident. Sweeping the convention across
the fleet found `a-budget`'s `CLAUDE.md` already doing it by hand, uncommitted:
`**SUPERSEDED WHILE IN DEBT PAYOFF — see "Envelopes: pure retroactive" below.**`
Somebody hit the problem and invented the fix locally, which is usually the sign
that a convention is missing rather than that a person is wrong.

**One thing not to copy from the site that produced these rules.** Its
`CLAUDE.md` is 963 lines and ~13K tokens, loaded into every session whatever the
task. The only measured study of this file class (Gloaguen et al., ETH Zurich,
arXiv:2602.11988, Feb 2026 — 138 tasks, four agents) puts developer-written
context files at **+4% task success for +19% inference cost**, and concludes
that unnecessary requirements in them make tasks _harder_. The archive is worth
having; keeping all of it in the always-on file is not. Traps and history belong
in the journal, and `CLAUDE.md` should hold the minimum a session must not
violate. This starter’s own is 194 lines and should stay closer to that than to 963.

## 2026-09-08 — The Webflow rebuild pipeline has a home, and it is not this repo (`docs/webflow-pipeline-records`)

Docs only. Nothing Webflow-specific enters this template, and that is the
decision worth recording.

The 2026-08-31 track-split spec said the Webflow importer targets the native
`page` type. **That was a third true.** The importer also emits `person`,
`news_article` and `collection_item` documents, and Beachfront renders them
through a `CollectionList` slice and a collections loader wired into the page
route — all of which exist in the Blux track and in Beachfront, none of them
here. Believing the old sentence would have made "point the importer at a native
clone" sound like a small job.

So the pipeline lives next door: importer and seed runner in reddoor-maintenance,
round scripts and the `/dev/match` twin installed by a new `match-harness`
recipe, the phase protocol in the `matching-a-page` skill, the round rules
written into each site's own `CLAUDE.md`. This repo gets one orientation row. The
rule behind that placement is what the Blux split taught: **the template ships no
hook whose default does work, and no field an editor cannot fill.** A "three-line
seam" in `page-load` was considered and rejected — same species as the two
document types probed per page load that native-ize deleted in #106 (242 files
changed, 178 deleted, slices 28 → 9, custom types 7 → 1, build 840K → 412K).

Lists on a rebuilt site are content relationships by default (a repeatable group
restricted to a type; order is the group's order; no route change), and automatic
indexes are dedicated routes with their own server load, like `/contact`. Both
are site-side patterns, not template mechanisms.

**The largest thing NOT done, so it is not rediscovered as new.** Fourteen
generic product-quality fixes Beachfront made between 2026-08-07 and 2026-09-02 —
noindex prefixes, reveal state in the markup, a focus-ring floor, live
reduced-motion, modal scroll-lock, nav tap response — are absent here and are
already propagating into sites bootstrapped from this template; Vida Legacy
Foundation inherited five of them on 2026-09-01 and independently re-fixed a
sixth. It is the largest per-site saving measured anywhere in this work (~18% of
a Beachfront-sized build, against ~10% for every conversion layer combined), and
it is now #121 on this repo with commits, files, native counterpart and a test
for each, one PR per item.

**Honest accounting, because this entry was drafted before the work it
describes.** The paragraphs above were written into the plan on 2026-09-08 and
are unchanged; what follows is what actually happened, and some of it contradicts
what was believed while planning. Two of the plan's own predictions were wrong on
contact. An empty Prismic repository does not 404 — it 500s, because the Content
API rejects the _predicate_ when nothing of that type is published. And the error
it gives, `unexpected field 'my.page.uid'`, was then documented as meaning "the
type was never pushed", which is also wrong: the same error appears with the type
registered, byte-identical to the error for a type that has never existed. Both
corrections are in reddoor-maintenance, the second one twice, because the first
fix asserted a discriminating check in both directions when it only holds in one.

That pattern is the entry's real content. Across one session, eight separate
claims failed the same way — a derived, cached, or configuration view of state
read as though it were the state. A CDN served a `no-store` response as a cache
hit. An author-filtered PR search returned a confident empty set because
self-hosted Renovate authors as a person, not an app. A `>>` redirect denied by a
sandbox still printed "appended", because the `echo` after it reports on itself.
Three of the eight were committed by someone actively holding the fleet rule
about positive evidence in mind, and one _while writing the correction to a
previous instance of it_. They are enumerated as reddoor-maintenance#711.

The eighth is the one worth carrying into this repo, because it is a different
shape and no rule here covers it. A verification step existed, was correct, was
run, and passed — and its coverage was exactly complementary to its bug: it
checked a CLI entry guard by invoking the script through a real path, and the
guard only fails when invoked through a symlink. An absent check is visibly
absent. A check blind in precisely the configuration that breaks reads as green
diligence. `CLAUDE.md`'s existing rules tell you to demand positive evidence and
to enumerate the class; neither tells you to ask **under what invocation the
evidence was produced, and whether that is the invocation that fails.**

## 2026-09-17 — Ready for site #2, except the a11y gate has been measuring a 404 page (audit only, no code change; #147)

A fifteen-agent workflow asked one question before the second client site is built
from this template: can `/new-site` clone `origin/main` today and produce a green
site? Four readiness audits — the starter itself, the `/new-site` and
`/figma-slices` skills, the Vida Legacy Foundation backport, and the
fleet-maintenance side — each had an adversarial verifier whose job was to
confirm, partially confirm or refute, and to list the claims that rested on the
absence of an error rather than on an artifact. Nothing in this repo was changed
today. This entry records what the audit found about the template and the
pipeline; the client-specific inventory is being written into another repo.

**The answer is yes, with numbers.** A fresh clone of `origin/main` at `0859ab8`,
with `/new-site`'s bootstrap edits applied (package name, the `netlify-site` CI
input, `SITE_NAME`, the README placeholders), installs from the frozen lockfile
and passes `pnpm verify`: prettier clean, eslint over 165 files with 0 errors and
0 warnings, svelte-check `COMPLETED 4519 FILES 0 ERRORS 0 WARNINGS`, a build, the
a11y audit, 60 test files / 469 unit tests, and 12 smoke specs. CI on that same
SHA (run 35182451450) logged the same counts, so the local run is not a different
configuration that happens to agree. eslint and prettier really do reach the
`.svelte` files — 46 of them, 0 different — which is the hole `.prettierrc`
closed and is worth re-measuring rather than assuming.

**The most valuable correction is that the a11y green is vacuous at bootstrap.**
The template ships `reddoor.a11yRoutes: ["/"]`, and `/new-site` step 3c sets it
before Prismic exists. While the `your-prismic-repo-name` sentinel is in place,
`/` returns 404 on purpose — `tests/smoke/routes.ts` knows that and asserts it.
The a11y audit does not: `@reddoorla/maintenance` 0.93.1, which the lockfile
pins, calls `page.goto(path)` and hands the page straight to axe with no status
check, so axe scans the SvelteKit error page and reports zero violations for a
home page that does not exist. A verifier reproduced the whole shape in its own
clone rather than trusting the auditor's logs: on 0.93.1 with `a11yRoutes ["/"]`,
`pnpm test:a11y` exits 0 and prints "0 violations across 2 routes"; pinned to
0.96.0 with the same config it exits 1 with `{id: "route-missing", impact:
"serious", route: "/", help: "/ returned 404"}`; the control, 0.96.0 with
`a11yRoutes []`, exits 0 again. The status branch first appears in v0.96.0 and is
absent from 0.93.1 through 0.95.1.

That matters more than a stale pin. This repo's own first rule says a pass must
require an artifact only a working system produces, and that a field which can
only observe configuration must not be named after the thing it cannot observe.
Here the rule fails _inside the instrument that enforces the other rules_: the
gate whose whole job is to produce positive evidence about rendered pages has
been producing an absence-of-violations result on an error page, and every
previous audit that cited "a11y: 0 violations" as evidence of health — including
this one's own positive-evidence list, as its verifier pointed out — inherited
that vacuity. The verifier also corrected the blast radius. Nothing is red today,
because `main` and fresh clones pin 0.93.1 and the shared Renovate config only
acts before 6pm on Mondays with a one-day `minimumReleaseAge`, so the earliest
window is 2026-09-21. When it fires, the red lands on the grouped
`renovate/all-minor-patch` PR, which carries `@lucide/svelte`, `@playwright/test`,
eslint, prettier, svelte, vite, typescript-eslint and the `reddoorla/.github` pin
along with the maintenance bump. One 404 therefore stalls every non-major update
in the group, not just the bump that exposes it.

**A fix that looked obvious would have broken the template.** The natural
follow-on to bumping to 0.96.0 is to take the new `reddoor.gateServer:
"preview"` option, which answers this repo's "verify on a production build" rule
and VLF's open issue about it. Two verifiers independently showed that setting it
at bootstrap is wrong. Under `preview`, the v0.96.0 Playwright `webServer` runs
the build and probes `http://localhost:<port>/` for readiness, and Playwright
1.62.1 treats a server as ready only for `statusCode >= 200 && statusCode < 404`
— so on the placeholder, where `/` is a deliberate 404, the server never becomes
ready and both gates fail at the five-minute timeout. Separately, the starter's
own browser specs target `/dev/a11y-fixtures` and `/dev/animate-in`, which `#134`
made 404 in a production build, so they would fail under preview even with a home
page. The order is: bootstrap on the dev server and report explicitly that the
gate is not yet measuring the site, publish the home document, then opt into
preview and split the `/dev`-targeting specs into their own project. One more
correction from the same thread: `gateServer` moves the hydration smoke, not the
axe scan, which stays on `vite dev` by design.

**VLF's process lessons came back; its code lessons largely did not.** The six
standing rules, the journal convention with its forward-pointer clause, the
figma-compare harness with the cap-height trim recorded per style, real
`a11yRoutes` at bootstrap, the locale-string inventory and the review-round rules
all landed here or in the skills. The generic defects VLF found while fixing its
own did not, and four of them were re-measured today rather than taken on
report. A Prismic preview of any non-home page lands on `/`: since `#90` the
client is routes-free, so the Content API leaves `doc.url` null, `/api/preview`
passes the bare client to `redirectToPreviewURL`, and `asLink` with no
linkResolver returns null, falling back to `defaultURL`. Run against the
installed `@prismicio/client` 7.22.0 with a stubbed fetch returning
`{uid: "about", url: null}`, this template answers `Location: /preview/` where
VLF's wrapper answers `Location: /preview/about`. The `--screen-*` tokens in
`app.css` are Tailwind v3 naming that v4 ignores: compiling `@theme { --screen-sm:
560px; --screen-xl: 1340px }` with the installed `@tailwindcss/node` 4.3.3 emits
`@media (width >= 40rem)` and `@media (width >= 80rem)`, so `sm` is really 640px
and `xl` really 1280px and the declared 560/1340 are dead — the second site to
rediscover this, after the Beachfront note. The fleet's Typekit swap,
`media="print" onload="this.media='all'"`, is an inline handler that the nonce
CSP refuses; measured in Chromium, media stays `print` and `faces=0`. The
verifier refuted half of that finding as received: all 210 font URLs in kit
`noj4tji.css` are `use.typekit.net/af/...`, so faces register and load with only
`use.typekit.net` in `style-src` and `font-src`; `p.typekit.net` is needed only
to silence the console error from the `p.css` tracking `@import`, which matters
because a console-error smoke assertion would fail on it. And `Nav.svelte` has no
no-JS path below `lg`: the link list is `hidden ... lg:flex` and the menu exists
only inside `{#if isMenuOpen}`, so a phone visitor without JS cannot navigate at
all — while the fleet Playwright config still forces `reducedMotion: "reduce"` on
every test, which is what made a class of no-JS assertions vacuous before.

**Four fleet-side facts would bite site #2 on day one.** The local maintenance
`dist/` was built at 2026-09-15 11:05, four hours before `#812` landed at 15:10,
so `ensure-site --name` still behaves create-only there; the skill never passes
`--name` anyway, which is why two fleet rows still carry their bare slug as the
client-facing Name sixteen days later. Checking `--version` does not detect this,
because the CLI reads its version from `package.json` at runtime and this stale
build cheerfully prints `0.96.0`. `sync-configs` still decides by exact byte
match for eslint, playwright, lighthouse and prettier: today's starter plans zero
writes, but VLF's `origin/main` plans two, and one of them replaces a 3020-byte
`playwright.config.ts` carrying a four-project no-JS/phone rendering matrix with
the 74-byte re-export — the suite still passes afterwards and simply covers less.
Across 24 local checkouts the planner would overwrite 38 such files. The starter
sits on maintenance 0.93.1 against a released 0.96.0, and on `reddoorla/.github`
v1.4.1 against v1.4.2 (22 of 23 org repos are on the old pin); v1.4.2 is the
commit that stops apt reading Google's Chrome repo, the failure that took out
every fleet CI run three times in forty minutes on 2026-09-09.

**Two of the traps the verifiers found are not about code at all.**
`ensure-site` throws unless the display name slugifies back to the slug, and
`siteSlug` lowercases and collapses non-alphanumerics, so the skill's own example
slug cannot take the client's real name — the slug decides the client-facing
name, in auto-reply copy and report subjects, and it also becomes the GitHub repo,
the Netlify site, the forms-ingest path and the suggested Prismic repo name.
Deciding it late means renaming five systems; the operator has now settled on
`roalson-interests`. The second: `FIGMA_PAT` is the only working Figma REST
credential on this machine — a read-only `/v1/me` with it returns 200 — and it is
what `scripts/figma-compare/pull-figma.mjs` in _this_ repo consumes at Stage A.
It appears on the maintenance meta-week list of "the four keys nothing reads",
tagged as measured, because that census grepped only the maintenance repo and
never saw the consumer that lives here. Carrying out that five-minute rider would
have deleted Stage A's credential days before it is needed.

**Honest accounting about the audit itself.** The verifiers' most useful output
was not the confirmations but the list of claims resting on absence of evidence:
grep finding no analytics IDs or font-kit strings is not proof the routes are
clean; `gh repo create --help` listing `--public` is not a repo created;
`node --check` passing on the figma-compare scripts is not the harness run
against a comp; "`/dev` routes 404 in production" was verified by observing that
the guard file exists in both repos, with no production build loaded; the
scroll-reveal no-JS spec was read, not mutated to watch it go red. Several
severities were corrected downward on contact — the missing capability-index
mention in the skills is belt-and-braces now that `docs/COMPONENTS.md` is tracked
and `CLAUDE.md` points every session at it, and the chrome-link prerender failure
names its own referrer in the error, so it costs one failed build rather than an
afternoon. Two side effects are worth recording because someone will otherwise
pay for them without knowing why: the starter-health agent's unsandboxed run of
`playwright install chromium` made Playwright 1.62.1 evict the cached
`chromium-1243` and `chromium_headless_shell-1243` builds from
`~/Library/Caches/ms-playwright`, so every other checkout pinned to 1243 will
re-download them on its next install; and one agent briefly wrote a probe script
into the `reddoor-maintenance` checkout before deleting it seconds later.

**Nothing was fixed today.** No file in this repo changed; this entry is the only
artifact. The skill patches — the `--name` argument, the rebuild step, the gate
order, the Typekit and Turnstile traps — are being made in the `claude-skills`
repo, and the template-side work (bump maintenance to 0.96.0 behind a
sentinel-aware a11y audit, the CI pin to v1.4.2, and the VLF backports named
above) is a separate batch that has not landed.

## 2026-09-17 — The maintenance bump and the CI pin, held together by a gate that was scanning a 404 (#148, `chore/bump-maintenance-0.96-ci-v142`)

Two pins were stale — `@reddoorla/maintenance` at `^0.93.1` against a published
0.96.0, and the reusable CI workflow at `v1.4.1`. They went in one PR because
bumping the first one alone turns this template's own CI red, and the reason it
does is worth more than either bump.

**The pairing.** 0.96.0 carries the route-status guard from
reddoor-maintenance#807 (closing #680): a route listed in
`package.json` → `reddoor.a11yRoutes` that does not answer 200 is recorded as
`route-missing`, impact `serious`, and axe is **not** run over the error page.
This template ships `a11yRoutes: ["/"]` and sits on the `your-prismic-repo-name`
sentinel permanently, so `/` 404s by design — `src/routes/[[preview=preview]]/+page.server.ts`
calls `error(404)` while `isPlaceholderRepo`, and `tests/smoke/routes.ts`
asserts exactly that 404. The two are not in conflict; they were never
introduced to each other.

**Measured, both directions, on this tree with 0.96.0 installed.** The rule is
that a guard you have not watched go red is not a guard you have tested, so the
`["/"]` case was restored on purpose and run:

```
a11yRoutes ["/"]  → exit 1
  a11y: 1 violations across 3 routes (2 fixtures + 1 from package.json) — route-missing on / (/ returned 404)

a11yRoutes []     → exit 0
  a11y: 0 violations across 2 routes (+1 hydration smoke)
```

**The belief that was wrong before contact.** The instinct was that this bump
merely _broke_ the template's a11y gate. It did the opposite: it exposed that
the gate had never been measuring anything here. For as long as `["/"]` has been
in this file against the sentinel, `pnpm test:a11y` was loading the 404 page,
running axe over it, finding nothing to flag on a bare error page, and reporting
a pass. The line `0 violations` was true and meant nothing — the exact shape
CLAUDE.md's "a pass needs positive evidence" rule names. 0.96.0 did not create a
red; it converted a false green into an honest one.

**Honest accounting: that diagnosis is not this session's.** It was made and
measured in the 2026-09-17 readiness audit (#147), whose verifier pinned 0.93.1
with `a11yRoutes ["/"]` in a clone and watched `pnpm test:a11y` exit 0 printing
"0 violations across 2 routes" for a home page that does not exist, then pinned
0.96.0 with the same config and watched it exit 1. This session measured only
the two runs above — 0.96.0 with `["/"]` and with `[]` — and did not re-run
0.93.1. Anyone re-deriving the blast radius should read #147's entry, not this
one; it also records the part that made the timing matter, which is that the red
would otherwise have landed on the grouped `renovate/all-minor-patch` PR on
2026-09-21, stalling eight unrelated updates behind one 404.

**The fix here is a workaround, and the better one is filed.** The template set
`a11yRoutes` to `[]` and `docs/NEW-SITE.md` grew a section saying why, and
saying that a real site adds `"/"` back at `/new-site` step 6 once the Prismic
repository exists and a `home` document is published — at which point the 0.96
guard becomes a genuine positive-evidence check instead of a scan of a 404.
Empty is not "gate off": the audit still scans `/dev/a11y-fixtures` and
`/dev/animate-in` and still hydration-smokes `/`, which is why the green above
reads `2 routes (+1 hydration smoke)`.

But `[]` is the only answer available to a template that can never have a real
route. It is the wrong answer for a real site, because an empty list is
precisely the configuration that once let a critical `image-alt` violation ship
to five production pages with CI green. The better fix is to make the audit
sentinel-aware the way `tests/smoke/routes.ts` already is — read
`slicemachine.config.json`, and on `your-prismic-repo-name` either expect the
404 or skip the route _with a labeled note in the summary_. That is
reddoorla/reddoor-maintenance#863. It matters well beyond this repo: `/new-site`
step 3c points the gates at real routes at bootstrap, step 6 replaces the
sentinel, and **every new site lives between those two steps** — so its first
maintenance-bump PR goes red for something that is not a defect in the site, and
whoever picks it up either debugs a non-bug or learns to route around the gate.

**The CI pin, and why it is not cosmetic.** `v1.4.2` adds one step before
`playwright install --with-deps`: `sudo rm -f /etc/apt/sources.list.d/google-chrome.list`.
On 2026-09-09 Google's Chrome apt repo served a `Packages.gz` whose hash did not
match its own signed `Release`, apt refused the entire update with "Hash Sum
mismatch", and every fleet CI run died there before a single test ran — three
times in forty minutes. Nothing in this stack installs `google-chrome`;
Playwright brings its own Chromium. Dropping the source takes a third party we
do not depend on out of the critical path. Pinned to the full SHA
`c714d9e472885bbf66f386e9f056a16aab7986d2`, tag comment kept, per the fleet
convention — a tag is a movable ref and a short SHA is not a pin.

**Found and not fixed.** The `/new-site` skill's step 3c still carries a "known
reporting trap" note claiming the a11y pass summary always reads
`0 violations across 2 routes` no matter how many routes ran (reddoor-maintenance#697),
and tells the operator to poll for the audit's temp spec file to learn the
truth. The run above disproves it — 0.96.0 prints
`3 routes (2 fixtures + 1 from package.json)`. The note lives in the
`claude-skills` repo, so it could not be fixed in this PR; it is recorded in
reddoorla/reddoor-maintenance#863 so it is not lost.

**Merge order.** This branch was cut from `origin/main` while #147
(journal-only) was still open against the same file. The conflict in
`docs/workJournal.md` duly happened; it was resolved by rebasing onto #147 and
keeping both entries in the order they merged, since they are appends to the
same tail and neither contradicts the other.

## 2026-09-17 — Bootstrapped from the template, and the brand palette broke the a11y gate on contact (`chore: bootstrap roalson-interests`, direct to main)

Second site built from `reddoor-starter` after vida-legacy-foundation, and the
first to run the patched `/new-site`. The design was handed over this morning;
nothing had been provisioned anywhere before today.

**Names, settled first because they are expensive later.** Slug, GitHub repo,
Netlify site and Prismic repository are all `roalson-interests`, and the fleet
row's Name is "Roalson Interests" — which slugifies back to the slug, the
condition `ensure-site` throws on. VLF and the-pointe-burbank both still carry a
bare machine slug as their client-facing Name because this step did not exist
when they were built.

**The Netlify name was free, and that was measured rather than assumed.** The
checklist is explicit that a 404 on `<slug>.netlify.app` proves nothing, because
Netlify serves the same 50-byte edge 404 for an unclaimed name and for a bogus
host. The account listed 64 sites and no `roalson*`, so the site was created
outright: it took the bare name, id `316ff26b-7d32-4669-a9dc-48a61ee299b6`. VLF
needed a `-rd` suffix and had `netlify-site` and its fleet-row URL corrected by
hand afterwards; that did not recur here.

**The Prismic repository exists and is empty — zero custom types — so the
`your-prismic-repo-name` sentinel stays for now.** Replacing it re-arms
loud-fail prerendering, which is correct once content exists and premature
against an empty repo. The consequence is stated plainly below, because it is
the kind of green that lies.

**The brand palette broke the a11y gate, and the first fix was the wrong shape.**
Roalson's secondary brand colour is dust `#B2AC9F`, which the brief had already
measured at 1.97:1 on the off-white ground `#F2EFE9` — a clear AA failure. What
the brief did not say, and what only the gate found, is that this template
spends `--color-secondary` as a **text** token in eight places: the footer
copyright, `Field.svelte`'s description line, the eyebrows on LeadText,
TextColumns and Testimonial, the testimonial role line, the contact intro and a
dev fixture. So assigning dust to `secondary` did not fail in one place; it
failed on every page that renders a footer.

axe named exactly one node: `<p class="text-sm text-secondary">© 2026 Roalson
Interests</p>`. The first response was to repoint the animate-in fixture at a
new `--color-secondary-aa` token — an instance fix, and it left the gate red,
because the fixture was never the failing element. The second response was the
right one: split the two jobs instead of renaming the failure.

    --color-secondary  #646059   AA-safe secondary TEXT (dust darkened to 56%)
    --color-dust       #B2AC9F   brand dust, a FILL on light grounds

Measured for `#646059`: 5.45:1 on off-white, 6.25:1 on white, 4.80:1 on sand —
AA with margin on every light ground in the palette. Plain dust keeps secondary
text **on garnet**, where it measures 5.11:1 and `#646059` would fail at 1.85:1.
That one remapping cleared all eight call sites with no per-file edits, and the
gate went green. The lesson is the one CLAUDE.md already states and this session
still had to pay for once: enumerate the class before fixing an instance. The
cheap tell was available immediately — `grep -rn "text-secondary"` returns eight
files, and a fix touching one of them cannot be the fix.

Worth noting for the upstream: the failure was not Roalson's palette being
unusual. Any site whose secondary brand colour is a light tint inherits it,
because the template asserts through naming that `secondary` is text-capable and
nothing checks that it is.

**Fonts.** Atkinson Hyperlegible Next is the design's only licensed face and is
OFL on Google Fonts — which answers the licence question Erik raised on
2026-09-01 and nobody had answered. It loads as a plain `<link rel=stylesheet>`,
deliberately **not** the fleet's `media="print"` + `onload` swap: that is an
inline event handler, this template's script-src grants nonces without
`unsafe-inline`, and a nonce never authorises a handler, so the sheet would
download and zero faces would apply. No CSP change was needed at all — the
baseline already allows `fonts.googleapis.com` under style-src and
`fonts.gstatic.com` under font-src.

**Area Normal Bold was not added, and should not be.** Every eyebrow in the
comps is set in it at ~12.2px, it is a commercial Blaze Type retail family, it
is not licensed for this project, and it carries no Figma text style at all —
those eyebrows are unstyled. They render in Atkinson SemiBold, which is what the
H4/H6 styles already specify.

**The reuse hook is installed and was proven, not assumed.** `.claude/` is
gitignored, so a clone starts with no hook; `.claude/settings.json` now wires
`scripts/hooks/reuse-context.mjs`, and piping a prompt mentioning "carousel"
through it returns `src/lib/components/Slider.svelte — 23 tests — matched on
"carousel"`. That is the mechanism that exists because three sessions in two
days re-derived components this repo already ships.

**What is NOT done, stated so it is not mistaken for done.**

- **The a11y gate has not measured a single page of this site.** It reports
  "0 violations across 2 routes", and both routes are dev fixtures.
  `reddoor.a11yRoutes` is `[]` and stays empty until the sentinel is replaced
  and a home document is published, because `/` 404s until then and the pinned
  CLI would record it as a serious `route-missing`. The green above is real
  about the fixtures and says nothing about the site.
- `src/lib/site-config.json` has no `nav.logo`, so the Nav renders the literal
  string "Logo". The logo lives in Figma and Dropbox; the Figma MCP connection
  is unauthenticated in this session.
- `footer.text` is the plain string "© 2026 Roalson Interests", so **the
  copyright year is frozen**. The template's `SiteConfig.footer.text` is a
  string, and its only alternative is a placeholder reading "Company Name". This
  needs either a Prismic `settings` loader or a component-side year.
- `DEFAULT_OG_IMAGE` and `static/favicon.png` are still template defaults; both
  need client assets.
- The palette was transcribed from the Figma styles via the build brief, which
  is a derived artifact. It must be reconciled against `get_variable_defs` at
  /figma-slices Stage A.

## 2026-09-17 — The footer stops freezing its year, and the palette rule is now a test (`fix/footer-owner-and-contrast-guard`)

Follow-on to the bootstrap entry above, carrying reddoor-starter#149 (`73ca386`)
into this repo. Both changes originate here — they were found by bootstrapping
this site — and were fixed upstream first so every future clone gets them.

**The copyright year.** The bootstrap set `footer.text` to the literal string
"© 2026 Roalson Interests", because the template's only alternative was a
placeholder reading "Company Name". That froze the year: right this January,
wrong every January after. `footer.owner` now names the entity and `<Footer>`
supplies the year at render, so `site-config.json` carries
`"owner": "Roalson Interests"` and no year at all.

**The palette rule is no longer only a comment.** `app.css` already explained
why `--color-secondary` had to be the AA-safe `#646059` and why brand dust
`#B2AC9F` lives in `--color-dust` as a fill. A comment is not a check, and the
next session to "simplify" those two tokens back into one would have found out
from the a11y gate, on a built page, one node at a time.
`src/lib/theme-contrast.test.ts` measures every text/ground pair the template
composes and fails below 4.5:1. Run against this site's real palette it is
green across 12 cases — which is the same assertion the comment was making,
now made by something that will fail out loud.

Nothing else changed. The a11y gate still measures no page of this site; that
remains true until the Prismic sentinel is replaced and a home document exists.

## 2026-09-17 — The nav wordmark is a real file now; the favicon mark is not shippable and the comps carry watermarked stock (`feat/brand-nav-logo`)

Three of the four "template-default brand assets" named in the bootstrap entry
were chased down today. One is fixed, one is blocked on a real asset, one does
not exist anywhere, and the search turned up a launch blocker that has nothing
to do with logos.

**Dropbox is not a source, and the earlier note about it was wrong twice.** The
folder is at `~/Reddoor Creative Dropbox/Clients/Roalson Interests` — NOT
`~/Dropbox`, which points at the personal account and has no Clients folder, so
a future session checking there will wrongly conclude the client folder is
missing. All 238 files are unhydrated online-only placeholders: `find -type f`
returns 238 and `find -type f ! -size 0` returns 0, and reading a file does not
hydrate it (`cat … | wc -c` → 0, still 0 bytes afterwards). The earlier claim
that the API token had EXPIRED was also wrong: there is no Dropbox credential on
this machine at all — a key-name enumeration of `credentials.env` returns 26
keys and none matches `*DROPBOX*`. Nothing should be built that reads from that
folder.

What Dropbox _does_ still tell us, from filenames alone, is that the real vector
masters exist: `01_Logos/FINAL/{SVG,PNG,AI,PDF,JPG}`, 11 variants — RI Logo in
Coal / Dust / Garnet / Olive / White, RI Wordmark in Coal, Coal_Dust, Dust,
Garnet_Dust, Olive_Dust, White. Hydrating just `FINAL/SVG` in Finder
("Make available offline") needs no token and unblocks the rest of this.

**The nav wordmark shipped, composed from Figma's own vector paths.** Figma
export works (verified by downloading bytes and decoding them, not by a 200).
`6788:3778` "RI Wordmark Garnet_Dust" is the master the real navbar uses — 10 of
its 11 instances are at 145 × 46.65 inside `6909:1859` "navbar garnet". Two
traps in getting a clean file out of it:

- the whole-node SVG export is **not transparent**. It opens with
  `<rect width="383" height="123" fill="#909090"/>` and also drags in the parent
  Components frame's `1191×1822` `#F1F6F7` rect. Both were stripped; the check is
  that no `#909090` or `#F1F6F7` fill survives, leaving only `#652323` and
  `#B2AC9F`.
- the PNG export bakes that same `#F1F6F7` ground in. That is a **cool**
  near-white and this site's ground is `#F2EFE9`, a warm cream — so the PNG
  would have shown a visible rectangle behind the logo. Rendering the stripped
  SVG onto `#F2EFE9` is how that was confirmed rather than assumed.

`static/logo.svg` is those paths at 383 × 123, no background, no script, no
external reference. `nav.logo.maxWidth` is set to `145px` to record the comp's
intent; it does not bind today, because `Nav.svelte` renders `h-8 w-auto` (32px
tall → ~99.5px wide at this 3.11:1 ratio). Sizing the nav to the comp is
/figma-slices work, not a data change.

**The favicon was NOT shipped, deliberately.** `6788:3779` "RI Logo Garnet" is
the cutout mark, and its letterforms bleed off the artboard by design — the R's
left stem is flush at x=0 and both letters run off the bottom. That is correct
at 451px in the hero, where the cityscape shows through the counters. Rendered
at favicon size it reads as a sliced-off shape, not "Ri"; this was confirmed by
looking at the 440×440 export, not inferred from the geometry. So
`static/favicon.png` is still the SvelteKit skeleton (128×128, 8-bit gray,
byte-identical to the starter's). The fix is the real bounded master in
Dropbox's `01_Logos/FINAL/SVG`, not a cropped Figma artboard, and not something
to quietly "correct" by adding padding to someone's logo.

**No OG card exists.** Grepping both Figma pages for `width="1200"` and
`height="630"` returns zero hits — there is no social card artboard in the file.
`6788:3777` (the wordmark reversed out of garnet) is the only garnet-field
artboard and the obvious base, but it is 382 × 123 at 3.1:1, so a card has to be
composed, not exported. This matters more than it sounds: static OG images are
never resized by this stack — `imgix()` returns the URL unchanged for anything
that is not `images.prismic.io`, so the committed file must be exactly
1200 × 630. "We have a logo" is not "we have an OG card".

**Launch blocker, unrelated to logos: the comps use watermarked stock.** 38
stock-named nodes across 9 distinct files on the Designs page. Four are iStock
comps — `istockphoto-1183992646-640_adpp_is` and three siblings — where the
`_adpp_is` suffix and 640px width mark them as watermarked preview downloads,
and the Getty watermark is plainly visible across the hero. Five more are
Unsplash. This repo's own history is explicit about why this gets an issue and
not a code comment: on a previous site a note about unlicensed placeholder
photography sat in a comment for four days and became the largest launch
blocker, because a comment is in neither an issue nor the "what is NOT done"
list, which are the two places a launch sweep reads.

**One decoy worth naming.** `4840:64` "AATI-full logo 1" is named like a logo
and sized like a nav lockup (164.91 × 28.04, 5.88:1), and it is an **empty
frame** — a screenshot of its twin returns a 1×1 PNG. "AATI" is a different
brand, left over from the wireframe kit this file was started from; the masthead
still contains hidden text reading "Welcome to your new wireframe kit". Twelve
copies exist, mostly hidden. Do not ship it.

**Still true, unchanged:** the a11y gate measures no page of this site, and
cannot fail on the nav logo in any case — `Nav.svelte` hardcodes `alt="Home"`
and `SiteConfig.nav.logo` has no alt field at all.

## 2026-09-17 — Stage A measured: the Figma file had 8 pages, no variables, three fonts and four sticky mechanisms (`docs/stage-a-inventory.md`)

Stage A discovery for the build, run as five parallel reads. Full inventory in
[docs/stage-a-inventory.md](stage-a-inventory.md); this entry records what was
BELIEVED going in and what measurement did to it, because most of it was wrong.

**The file has 8 pages, not 2 and not 5.** `get_metadata` with no nodeId lists
two. The prior audit concluded "2 of 5". The document's own page collection
reports eight, read directly rather than inferred. Two of the six invisible
pages carried material findings — a superseded 390×7985 mobile Properties
concept, and a "Site Plan" page that belongs to a different client entirely
(its nav reads Home / About Us / Our Facility / 210 TACLabs / Contact Us). An
inventory built off the `get_metadata` listing would have been built off a
quarter of the file and would have taken that sitemap as ours.

**There are no Figma variables at all.** Zero collections, zero variables. What
`get_variable_defs` returns is the local _paint styles_, whose names are their
own hex strings — `"#652323": "#652323"`. The skill's rule is to read tokens from
`get_variable_defs` and never from a derived artifact; here that rule is
satisfied only trivially, because there is no token layer to inherit. Every
semantic name in `app.css` is ours. Worth recording precisely, because the rule
reads like a guarantee and in this file it is a tautology. Also operational:
`get_variable_defs` REFUSES a page/canvas node ("You currently have nothing
selected") and must be called on a frame.

**A third unlicensed font nobody had mentioned.** Area Normal was known. The
footer address block turns out to be Helvetica Neue LT Std — 10 nodes, bound to
no style, matching Body 2 exactly at 14/20 400. Page 2 of the file is the
untouched wireframe kit and uses that family 1512 times; the block was pasted
across and never restyled. It is comp drift, not a third intended face.

**And the comp is lying about Area Normal.** `hasMissingFont` is true on all 82
nodes and no Area family is installed in Figma, so those eyebrows render in a
SUBSTITUTE. Their widths, and the 0.818 trim ratio measured off them, are the
substitute's metrics. Anyone measuring the eyebrows off an exported PNG measures
the same wrong thing. The family is `Area Normal`, style `Bold`; there is no
family called "Area Normal Bold".

**The cap-height trim is exactly 0.66em, and H6 is the trap.** Nine single-line
Atkinson nodes from 10px to 66px all reduce to `round(0.66 × size)` after
Figma's whole-pixel rounding, and the multi-line formula
`(lines − 1) × lineHeight + round(0.66 × size)` reproduces four measured nodes
with zero residual. The trap is that H6 — the file's most-used style at 185
nodes, every nav link and every "Learn more" — is the ONLY label-sized style
with trim NONE. So a gap read between an H6 link and an adjacent H5 label
compares an 18px line box against an 8px cap-to-baseline box: 10px of difference
at the same nominal 12px.

**Sticky is four mechanisms, not one.** The navbar, the homepage hero (pinned at
all three widths), the 800px photo band (collapsing to 240 on mobile) and the
Properties category dividers all carry `STICKY_SCROLLS`. This is precisely the
class the skill says costs nine PRs when it is found after the slices merge, and
it was found before the first one.

**The prototype encodes nothing about LEARN MORE.** Pulled from REST: the
homepage has 361 nodes of which 10 carry interactions, Properties 575 of which
5, and the complete list is hover swaps, carousel autoplay and arrows, a navbar
timeout, and a resources disclosure whose overlay points at `destinationId:
null`. Not one interaction on any LEARN MORE, map pin, PROFILE, CONTACT or nav
link. That is a measured negative and it is worth more than the previous
"unanswered", because it rules out the prototype as a source.

**Figma comments ARE readable — via REST, not via the MCP.** The skill says
comments are unreadable and to transcribe them by hand. They came back through
the REST API, and one of them is the only positive evidence we have on the
gating question: Erik, 2026-09-01, on the Properties frame, unresolved — "Make
these links as short as possible for sharing." Hit-tested against the frame
geometry, its anchor lands inside a property card's description block, where
LEARN MORE sits. That is a routing requirement either way and it leans detail
page, but it does not settle it.

**Two of the brief's contrast claims are wrong.** The mobile hamburger is NOT a
failure — it sits on a garnet ground at 5.11:1. The dust value-list items are
NOT failures — they sit on the garnet gradient at 5.11–7.55:1. The real failure
is the CONTACT US label on the light-ground navbar at 1.97:1, and the nav-link
COMPONENT SPEC on the Components sheet carries the same defect one step earlier,
so a nav built from the sheet rather than the page ships it. One new failure the
brief missed: white on sand at 1.30:1, in the Concepts section.

**Layer names on Properties are swapped.** The frame named `Improved` has a
divider reading Land; the frame named `Land` reads Improved Projects; a second
frame named `Land` is Sold. Read the dividers. And Sold is fully designed —
which answers an open question — with a hidden map and a 3×2 grid instead of
the map-plus-rows pattern.

**Honest accounting.** None of the above came from the build brief, which is a
transcription and was wrong or incomplete on the page count, the variables, the
font count, two of three contrast claims, the slideshow dimensions (928 is its
width, not its height) and the existence of the Sold section. The brief remains
the best narrative of the project; it is not a measurement, and Stage B should
treat the inventory as the measurement and the brief as context.
