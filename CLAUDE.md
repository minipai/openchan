# Working on openchan

## Taking an issue

Work is tracked in Linear (team Starcoder, project OpenChan). One issue, one
branch, one PR, then the next — do not wait for a merge. The procedure for
carrying one ticket that far is the `work-an-issue` skill — load it when you
have a ticket.

Never merge your own PR. Merging belongs to the repo's owner, or to whoever
dispatched the work once they have verified it themselves — see the
`dispatch` skill for that side of it.

`~/Dev/openchan` itself stays on `main` — someone else is usually reading it.
Each issue gets its own worktree beside it (`~/Dev/openchan-sta-NN`), so two
of us working at once never share a checkout. Update it with `git pull --ff-only`
— it is sitting on `main`, so there is nothing to check out.

Inside a worktree, `git fetch origin main:main` is refused for that very reason:
git will not write a branch another checkout is sitting on. Rebase onto the
remote instead: `git fetch origin main` then `git rebase origin/main`.
On a branch stacked on another issue's, rebase onto that parent instead —
`origin/main` would rewrite the parent's commits into yours.

## Testing it running

She is a picture in a terminal. Open a **new herdr tab** and run `bun run dev`
there:

```sh
herdr tab create --cwd <your own checkout> --label <what>-test
herdr pane run <pane_id> 'bun run dev'
```

Not a split pane — she does not fit in one, and reading a pane cannot see her
anyway: the sprite is drawn with the terminal's graphics protocol and never
lands in the character grid. Close the tab when you are done.

Driving her from the outside has one trap: a whole sentence pasted into her
input never gets sent — Enter submits nothing and the text sits there. Send the
text and a `return` as two steps instead.

## Commits

One PR, one commit. Fixing what a review found is `git commit --amend` and a
force-push, not a second commit — what lands on `main` is one finished change,
not a change plus its corrections. Split only when it is genuinely two things.

The exception is a stacked branch: if another branch is already growing on top
of yours, amending pulls the ground out from under it. Check before you amend.

Commit messages and PR text are in English, whatever language the conversation
is in. Write the *why*.

## Her, and the others

Personas and artwork are not drawn here — they come from
`~/Dev/claudecafe/packages/characters/<name>/`, which has `persona.en.md`,
`persona.zh.md`, `portraits/` and `expressions/<outfit>/`.

Only **kotone** and **kurumi** are complete: two outfits each, all 26
expressions. The package holds three more (kanae, kokona, kuroko) drawn for 13
of the 26 — leave them out. `art/LICENSE` covers the artwork; it travels with
it.
