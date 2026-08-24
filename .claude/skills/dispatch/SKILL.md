---
name: dispatch
description: Run several openchan issues at once by handing each to its own Claude in its own terminal tab, then verifying and landing the work. Covers picking parallel-safe issues, writing the brief, opening worktrees and tabs, being notified when workers finish, verifying with a fresh instance, and merging. Use when running the dispatch loop over the Linear backlog — not when implementing an issue yourself.
---

# Dispatching openchan issues

You are not the one writing the code. Each issue goes to its own Claude, in its
own worktree, in its own tab. Your job is choosing the work, writing the brief,
knowing when they are finished, and deciding whether what came back is good
enough to land.

`CLAUDE.md` is the contract the *workers* follow, and it loads into their
sessions automatically. Everything here is the half they never see.

## Merging

`CLAUDE.md` says nobody merges their own PR. That still holds — a worker never
merges. The dispatcher does, after verification that did not come from the
worker. Merge someone else's finished work; never your own.

## 1. Pick what can run at once

Read the backlog in Linear (team Starcoder, project OpenChan). Two issues can
run in parallel when they touch disjoint files. When they don't, stack them:
the second branches off the first and its PR points `--base` at it, and GitHub
retargets to `main` when the parent merges.

Three at a time is comfortable. The limit is not the machine, it is how much
verification you can do at the end.

## 2. One worktree per issue

    git -C ~/Dev/openchan worktree add ~/Dev/openchan-sta-NN -b <linear-branch-name> main

Branch off the parent branch instead of `main` when the issue is stacked.
`~/Dev/openchan` itself stays parked on `main` — someone else is usually
reading it.

Set the issue **In Progress** and assign it before dispatching. A worker that
has to do this first often gets it wrong.

## 3. Write the brief

One file per issue under `notes/tasks/sta-NN.md`. It is the whole prompt; the
worker starts with nothing else.

What belongs in it:

- Which issue, and that the branch is already created and checked out.
- **"Load the `work-an-issue` skill and follow it."** That is the whole
  procedure, and one line buys all of it. **Do not restate it**, and do not
  restate `CLAUDE.md` either — it loads on its own. Old briefs in `notes/tasks/`
  copied both out by hand; that is how the copies drift from the original.
- What you already know and *have verified* — the failing line, the reason,
  where it surfaces. Say plainly that it is a clue to check, not gospel.
- The shape of the answer, when you care about it. Whether this is the first of
  several similar panels, what it must not turn into, what is out of scope.
- Base branch for the PR, if it isn't `main`.
- "Work to the end, do not stop to ask questions."

Say what you want back at the end — what changed, PR URL, what Codex said,
Linear status. Four lines is enough to know whether to look closer. Give it this
session's name and ask for those four lines by `SendMessage`, so the report
comes to you rather than sitting in a terminal waiting to be found.

## 4. Open the tab and hand it over

    herdr tab create --workspace w1 --cwd ~/Dev/openchan-sta-NN --label sta-NN --no-focus

The result carries `.result.root_pane.pane_id` and `.result.tab.tab_id`. Keep
both — the pane to wait on, the tab to close.

    herdr pane run <pane_id> 'claude --permission-mode auto "$(cat notes/tasks/sta-NN.md)"'

`--no-focus`, or every tab you open steals the screen from whoever is sitting
at the keyboard.

**Model.** Add `--model sonnet` when the ticket is mechanical — a pure move, a
batch rename, anything where the judgement is written into the ticket rather
than left in the head of whoever does it. Everything that has to decide
something and then argue for it in the PR stays on Opus. Verification is always
Opus.

## 5. Let them come back to you

Don't sit and watch. A dispatched Claude is a local session like any other, and
it can reach you.

Once it starts it appears in `ListAgents` under a name of its own. Take that
name and subscribe:

    SendMessage({to: "<its name>", notify_when_idle: true})

With no message it costs that session nothing, and one notice arrives here when
it finishes its turn — which, for a worker handed a single brief, is when it is
done. The notice quotes that session's closing line, so a bare subscription
already tells you roughly what happened. Only the first line, though.

Better still, put your own session name (the first line of `ListAgents`) in the
brief and ask for the closing lines to be sent back with `SendMessage`. Then the
report arrives with the notice instead of you fetching it afterwards.

Neither reaches you from a worker that died mid-turn or never started, so keep
one backstop per pane running in the background:

    herdr wait agent-status <pane_id> --status done --timeout 3600000

Exit 0 when it lands, exit 1 on timeout; it returns at once if the pane is
already there, so re-running is safe.

Treat it as a liveness check and nothing more. Neither status is a finish line:
`idle` is where a working agent sits between turns, and `done` fires as soon as
it stops typing — a worker waiting on Codex in a background monitor reaches
`done` and then carries on for several more minutes. What ends the job is the
worker's own report arriving.

When the closing lines aren't enough, the whole conversation is on disk.
`herdr agent get <pane_id>` carries `agent_session.value`, the worker's Claude
session id, and its transcript is at `~/.claude/projects/<slug>/<id>.jsonl` —
`<slug>` being its own working directory with every `/` turned into `-`, so a
worker in `~/Dev/openchan-sta-49` writes under `-Users-art-Dev-openchan-sta-49`
and not under the main repo. The last assistant message is the report verbatim. `herdr pane read <pane_id> --source recent`
reaches scrollback as well, but wide characters come back padded out with
spaces — glance with it, don't collect with it.

## 6. Verify with someone who wasn't there

The worker's own report is not evidence, and neither is you reading the diff.
Open a **new tab with a fresh Claude** and give it the acceptance criteria, one
by one, to check against the thing actually running.

    herdr tab create --workspace w1 --cwd ~/Dev/openchan-sta-NN --label sta-NN-verify --no-focus
    herdr pane run <pane_id> 'claude --permission-mode auto "$(cat notes/tasks/sta-NN-verify.md)"'

The verifier reads her on screen, and `CLAUDE.md` already says how that is done
and where it goes wrong. Say in its brief that this is what you want checked;
don't re-explain it.

Every failure worth catching this session was caught here, by someone looking at
the screen. It is the last place to economise.

**For refactors, add a static check.** A move should not change behaviour, and
`bun test` says so precisely: the pass count *and* the `expect()` call count
must be identical before and after. An unchanged assertion count means nothing
was added, removed or quietly rewritten. Then diff the moved files with
`grep -h` against their originals — without `-h`, multiple file arguments
prefix each line with its filename and every line looks changed.

## 7. Land it

The worker has already read Codex and acted on its findings — that is in
`CLAUDE.md`, and doing it twice buys nothing. What is left is the one case a
worker cannot cover: Codex reviews once, when the PR opens, and a worker that
finished before it spoke is gone with nobody watching. So check that it said
something at all. Silence past twenty minutes is stuck rather than thinking;
`@codex review` as a comment wakes it. Where to read it is in `CLAUDE.md`.

Then:

    gh pr merge <n> --rebase

`--rebase`, never `--squash` — each commit stays its own on main.

Close the worker and verifier tabs with `herdr tab close <tab_id>`, and remove
the worktree. Linear's GitHub integration sets the issue Done on merge; read it
back rather than trusting it, the same way workers have to.
