# openchan

A maid who lives in your terminal. The screen is ours; the brain is
[opencode](https://opencode.ai), so she can think with any model you have
connected — not only Claude.

She is drawn as a picture, not as text art: real artwork standing at the bottom
edge with a galgame dialogue box over her. What she says streams in as she
writes it, what she is doing is narrated in one line above the box, and the face
she signs each reply with is the sprite she wears.

```sh
bun install
bun dev
```

## Requirements

- **Bun.**
- **A terminal that speaks the kitty graphics protocol** — Ghostty, kitty,
  WezTerm. Anywhere else she falls back to half-block characters, which works
  but is a much rougher picture; macOS Terminal and the VS Code terminal are in
  that group. `Ctrl-B` asks for that picture on purpose, wherever you are.
- **opencode, signed in to at least one provider** (`opencode` → `/connect`).
  She starts a server of her own on a free port, so it will not collide with
  one you are already running.

## Keys

| | |
|---|---|
| `Enter` | send |
| `ESC` | interrupt her |
| `y` / `n` | allow or refuse a tool she asked for |
| `↑` `↓` `Enter` | when she asks you to pick — `Space` ticks, if she said more than one will do; `ESC` declines rather than answering |
| `Ctrl-R` | read what she wrote — anything longer than a line lives on its own page |
| `Ctrl-B` | draw her out of half-block characters — the rougher picture, on purpose |
| `Ctrl-C` | leave |

Running commands, editing files and fetching the web are all set to ask, so
nothing happens to your folder without a y. When she wants a decision rather
than a permission, she asks it with the answers written out, and you pick one —
or several — off a list instead of typing.

## Choosing her model

```sh
CAFE_MODEL=provider/model bun dev
```

Named the way opencode names models. The default is a free one, so starting her
up never quietly spends money.

## How it is put together

| | |
|---|---|
| `src/opencode/opencode.ts` | the only file that knows opencode exists — it turns the server's event stream into her vocabulary |
| `src/between/protocol.ts` | that vocabulary: she said something, she picked something up, she wants permission, she wants something picked, she is done — and what the screen may ask of her in return |
| `src/between/scene.ts` | what an event leaves on the scene: the latest of each, and nothing decided |
| `src/between/brain.ts` | holds her open for as long as the window is, and hands the screen one scene |
| `src/window/keys.ts` | every key the window answers to, written down once — the overlay and the screen both read it off here |
| `src/window/App.tsx` + `box/` / `strip/` / `over/` | the screen: her box and what goes in it, the line above it, and what can stand over the whole scene |
| `src/her/expressions.ts` | the 26 faces, and the mood marker that names them |
| `src/her/cast.ts` | who can be sent for: whoever is both written and drawn |
| `persona/` | who each of them is, appended to opencode's own instructions rather than replacing them |
| `art/` | their sprites, one folder each |

Swapping the agent underneath means writing one more translator and touching
nothing else.

## Her, and the other one

She is ことね, out of [claudecafe](https://github.com/minipai/claudecafe), and
くるみ is here too — `Ctrl-G` says who is on shift. Who is standing there is
settled when a session opens: her persona goes into the agent as that starts, so
sending for the other one mid-conversation puts her on the next session rather
than rewriting the one you are in. The pick is kept in `~/.openchan/on-shift`,
so the next window opens as her.

Anyone with a persona file in `persona/` and all 26 faces in `art/` joins the
list, and the cast is written down nowhere else. ことね is only the one who opens
the door the first time.

The code is MIT. The characters and the artwork are not: see `art/LICENSE` —
yours to use and to alter, not to resell or to publish as your own character.
