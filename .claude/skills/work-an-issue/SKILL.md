---
name: work-an-issue
description: Take one openchan issue from Linear through to a PR — branch, implement, self-review before pushing, test it running, open the PR, deal with Codex, and report done. Use when you have been given an openchan issue to build, or are picking one up from the backlog. The repo's standing rules in CLAUDE.md apply either way; this is only the procedure for a ticket.
---

# Working one issue

1. Set the issue **In Progress** and assign it to yourself. Branch with the name
   Linear gives the issue.
2. Implement. `bun test` and `bun run check` both green.
3. **Get your own code review before you push.** A `code-reviewer` subagent over
   the branch diff. Judge what it says — disagreeing is fine, but be able to say
   why. Nothing leaves the machine unreviewed.
4. **Test it running.** `CLAUDE.md` says how; it is a whole terminal tab, not a
   split pane.
5. Open the PR. If the previous issue's branch is not merged yet, branch off it
   and point `--base` at it; GitHub retargets to `main` when the parent merges.
6. **Codex reviews automatically when the PR opens**, and there is no second
   pass after a later push. Findings land as inline review comments —
   `gh pr view --comments` shows nothing — so read both places:
   `gh api repos/minipai/openchan/pulls/<n>/comments` for the inline ones and
   `gh api repos/minipai/openchan/issues/<n>/comments` for the verdict it
   leaves when it found nothing. If it has said nothing at all after twenty
   minutes it is stuck rather than thinking; `@codex review` as a comment
   wakes it.
7. Act on the findings **once**. Nothing here is worth a round trip unless it is
   actually broken.
8. **Only once Codex is dealt with** are you finished. Set the issue
   **In Review** and report back, then read the issue again — Linear's GitHub
   integration pushes it to In Progress when the PR moves, so setting it is not
   the same as it sticking.

Branching, commits, testing her on screen and who may merge are in `CLAUDE.md`
and hold whether or not there is an issue. They are not repeated here.
