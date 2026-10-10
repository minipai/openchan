# Chat views

One web build contains all five views. The **Chat view** icon immediately after the Summary (Session details) control in the session header opens the choices directly, with horizontal or vertical tabs. The mobile navigation menu also offers **Chat view**. The selector shares the existing header row without changing the conversation or composer height:

- **Original**: original conversation and full-width composer without character artwork or Flow presentation.
- **Stage**: native conversation with the large portrait overlay and history-reading treatment.
- **Flow**: compact conversation, foldable message blocks, and message-specific pop-out avatars.
- **Companion**: native conversation with a small animated character beside a shorter input box.
- **Document**: continuous native scrolling with each prompt and its responses enclosed in a transparent, square-bordered paper. A live 480px portrait floats inside the paper on the right below the prompt. Text wraps around its transparent silhouette. Earlier history is virtualized and loads as you scroll up.

The choice is stored in `settings.v3` as `general.chatView` and defaults to Stage. Switching presentation keeps the routed session and composer mounted, including its draft and pending input. Session history, tool execution, requests, and model selection remain shared.

## Build and preview

- `bun run dev:web`: one development server, bound to `0.0.0.0`.
- `bun run build:web`: one output directory, `packages/app/dist`.
- `bun run test:e2e:views` from `packages/app`: native/Flow presentation, view switching, draft persistence, and companion states in the same build.

The existing local previews on ports 4273, 4274, and 4275 can all serve that same output. Their old `dist-flow` and `dist-companion` paths are local symlinks to `dist`, not separate builds. View preferences are per browser origin, so each port can remember a different selection.

## Ownership

- `index.tsx` is the stable shell around the shared content and composer slots. Its `data-session-layout` attribute scopes view-specific CSS. Stage mounts its portrait in this shell; Document places a live portrait inside each paper through the session overlay slot.
- `view-select.tsx` owns the native selection form; `settings/model.tsx` owns persistence.
- `flow.css` and `../timeline/flow-density.ts` implement Flow's compact presentation. Native tool groups retain their membership, even across assistant messages. Old message paragraphs collapse separately; pending steers do not hide the current response. Message labels, avatars, and arrows retain their folding controls. Both summaries and full content remain centered with a 1000px maximum width.
- `companion.css` positions the animation at the composer's leading edge. Companion uses the original timeline without Flow labels, avatars, or automatic folding.
- `document.css` handles paper dimensions, typography, and narrow panels. Document virtualizes complete exchanges so each mounted paper can lay out its native rows together and text can wrap around the portrait. Other views retain virtualized rows.

## Document reading

Document opens at the latest exchange without loading the entire conversation. Papers remain in normal chronological order under one native scroll viewport; scrolling upward loads older history while preserving the visible anchor. Prompt submission follows the new paper into view, while ordinary scrolling up suspends following until the user returns to the end. The session header and shared composer stay outside the papers. Search, tool details, attachments, and copy controls remain the native implementations.

## Companion animations

`../composer/companion.tsx` derives state from waiting for a request, working, a nonempty text draft, then the latest durable idle outcome (failure or success), otherwise idle. An interruption stays idle. Clearing a draft reveals the latest outcome again. Each state entry randomly selects one of that state's variants; further keystrokes or streamed output within the same state retain that choice. There are no animation timers or mid-playback rotations.

Local artwork lives in `public/characters/kotone/companion/<state>-<variant>.gif`, with matching first-frame PNGs for reduced motion. All 23 files come from `http://192.168.88.8:8038/`: idle 01–03, typing 03–05, working 01–05, error 03–05, success 01–05, waiting 02–05. Like portraits, artwork is kept out of commits.
