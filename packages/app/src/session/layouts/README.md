# Session layouts

The chat layout is selected at build time with `VITE_OPENCODE_CHAT_LAYOUT=stage|flow|companion`; it defaults to `stage`. Unknown values fail the Vite build instead of silently choosing a layout.

From the repository root:

| Command | Layout | Output |
| --- | --- | --- |
| `bun run dev:web:stage` | Stage | Dev server on port 4444 |
| `bun run dev:web:flow` | Flow | Dev server on port 4445 |
| `bun run dev:web:companion` | Companion | Dev server on port 4446 |
| `bun run build:web:stage` | Stage | `packages/app/dist` |
| `bun run build:web:flow` | Flow | `packages/app/dist-flow` |
| `bun run build:web:companion` | Companion | `packages/app/dist-companion` |

Dev servers bind to `0.0.0.0`. The existing `VITE_OPENCODE_SERVER_HOST` and `VITE_OPENCODE_SERVER_PORT` variables choose the backend for development. These commands run the frontend only. The local preview on port 4274 serves `dist-flow` (no companion); port 4275 serves `dist-companion`. These output directories must stay separate.

## Ownership

- `index.ts` selects a layout once per build, so navigation and cached timelines keep the same component owner.
- `stage.tsx` contains the approved shared-stage composition, including the `session.overlay` slot. Portrait styling is scoped to `[data-session-layout="stage"]` in the portrait extension.
- `flow.tsx` and `flow.css` arrange the high-density conversation and composer. Historical text paragraphs, user messages, and standalone notices collapse individually. Native tool groups (such as “Used 18”) retain their original membership and disclosure, including groups spanning several assistant messages. The latest visible message in the active delivered input stays expanded; pending steers do not collapse the live response. Expanded content reuses the standard renderer. Both summaries and full content retain its centered 1000px maximum width. Flow does not mount the overlay slot.
- `types.ts` defines the content, overlay, composer and history-reading inputs supplied by the session screen.

`companion.tsx` renders the original OpenCode timeline and composer without the portrait overlay. It does not enable Flow's density adapter, custom role labels, per-message folding, or avatars. Its only addition is the small animation alongside the composer, styled in `companion.css`.

The screen continues to own the timeline cache, session data, composer actions, mobile panels and scrolling. Layouts arrange those inputs; they do not recreate the providers, fetch messages, or implement another composer. Add Flow's presentation in its own files, keeping its selectors scoped to `[data-session-layout="flow"]`.

The Companion build adds a small decorative companion at the native composer's leading edge. Plain Flow keeps its full-width composer without an animation. `../composer/companion.tsx` derives state from waiting for a request, working, a nonempty text draft, then the latest durable idle outcome (failure or success), otherwise idle. An interruption stays idle. Clearing a draft reveals the latest outcome again. Each state entry randomly selects one of that state's variants; further keystrokes or streamed output within the same state retain that choice. There are no animation timers or mid-playback rotations. Existing request panels and submission behavior remain owned by the composer region. Run `bun run test:e2e:companion` from `packages/app` to verify the native timeline and animation states; `test:e2e:flow` guards the separate Flow layout without a companion.

Local artwork lives in `public/characters/kotone/companion/<state>-<variant>.gif`, with matching first-frame PNGs for reduced motion. All 23 files come from `http://192.168.88.8:8038/`: idle 01–03, typing 03–05, working 01–05, error 03–05, success 01–05, waiting 02–05. Like portraits, artwork is kept out of commits.

Flow presents tools and their following reply as one block with a divider at the end. An assistant block shows one 80×80 circular avatar only when it has text; a matching upper image layer lets the hair and headwear extend above the circle. Tool-only blocks leave that column empty. User and event blocks use padded 80px-wide labels. Rows have no horizontal padding, and expanding text adds no top spacing. Clicking an avatar or label toggles its text, or its native disclosure when there is no text. Collapsed previews remain selectable; their separate arrow expands them. The latest message starts expanded but can be folded manually. Its timeline adapter lives in `../timeline/flow-density.ts`. Run its production keeper with `bun run test:e2e:flow` from `packages/app`; it covers shared reply avatars, label toggles, collapsed-text selection, native tool grouping across messages, paragraph expansion, pending steers, streaming, and compact mobile geometry.
