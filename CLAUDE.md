# Working on openchan

## One issue at a time

Work is tracked in Linear (team Starcoder, project OpenChan). One issue, one
branch, one PR, then the next — do not wait for a merge.

1. Set the issue **In Progress** and assign it to yourself. Branch with the name
   Linear gives the issue.
2. Implement. `bun test` and `bun run check` both green.
3. **Get your own code review** before anyone else sees it: a `code-reviewer`
   subagent over the branch diff. Judge what it says — disagreeing is fine, but
   be able to say why.
4. **Test it running**, see below.
5. Open the PR. If the previous issue's branch is not merged yet, branch off it
   and point `--base` at it; GitHub retargets to `main` when the parent merges.
6. **Codex reviews automatically when the PR opens.** Do not post
   `@codex review` — and do not wait for a second pass after pushing, because
   there isn't one. Its findings are inline review comments, so
   `gh pr view --comments` shows nothing; read them with
   `gh api repos/minipai/openchan/pulls/<n>/comments`.
7. Act on the findings **once**. Nothing here is worth a round trip unless it is
   actually broken.
8. Set the issue **In Review**, then read it back — Linear's GitHub integration
   pushes it to In Progress again when the PR moves, so setting it is not the
   same as it sticking.

Merging is the master's. Never merge your own PR.

## Testing it running

She is a picture in a terminal. Open a **new herdr tab** and run `bun run dev`
there:

```sh
herdr tab create --cwd /Users/art/Dev/openchan --label <issue>-test
herdr pane run <pane_id> 'bun run dev'
```

Not a split pane — she does not fit in one, and reading a pane cannot see her
anyway: the sprite is drawn with the terminal's graphics protocol and never
lands in the character grid. Close the tab when you are done.

## Commits

One PR, one commit. Fixing what a review found is `git commit --amend` and a
force-push, not a second commit — what the master reads is one finished change,
and "then I fixed the review comments" is not part of the history. Split only
when the change is genuinely two things.

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
