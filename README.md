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
| `Ctrl-B` | draw her out of half-block characters — the rougher picture, on purpose |
| `Ctrl-C` | leave |

Running commands, editing files and fetching the web are all set to ask, so
nothing happens to your folder without a y.

## Choosing her model

```sh
CAFE_MODEL=provider/model bun dev
```

Named the way opencode names models. The default is a free one, so starting her
up never quietly spends money.

## How it is put together

| | |
|---|---|
| `src/opencode.ts` | the only file that knows opencode exists — it turns the server's event stream into her vocabulary |
| `src/protocol.ts` | that vocabulary: she said something, she picked something up, she wants permission, she is done — and what the screen may ask of her in return |
| `src/scene.ts` | what an event leaves on the scene: the latest of each, and nothing decided |
| `src/brain.ts` | holds her open for as long as the window is, and hands the screen one scene |
| `src/App.tsx` + `SpriteLayer` / `DialogueBox` | the screen |
| `src/expressions.ts` | the 26 faces, and the mood marker that names them |
| `persona/` | who she is, appended to opencode's own instructions rather than replacing them |
| `art/` | her sprites |

Swapping the agent underneath means writing one more translator and touching
nothing else.

## Her

She is ことね, out of [claudecafe](https://github.com/minipai/claudecafe). The
code is MIT. The character and the artwork are not: see `art/LICENSE` — yours to
use and to alter, not to resell or to publish as your own character.
