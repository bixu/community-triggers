# Open in Pi

Launches [Pi](https://pi.dev/) in the current Tuple transcription directory when transcription starts.

The trigger writes an `open-in-pi.command` wrapper next to the live transcript files and asks macOS to open it. The wrapper runs as `#!/bin/zsh -li`, so `pi` is resolved from the same interactive shell environment you get in a new terminal. No install location or model is hard-coded — Pi uses whichever provider and model you have configured as your default.

## What makes this one different

Most editor sidekicks can only check the transcript when you speak to them. This one makes Pi an **active listener**: it consumes the call as it happens, drops a one-line summary of what was just covered so you can follow along at a glance, and interjects with substance only when something is worth saying.

The trigger ships a Pi extension — `tuple-call-watch.ts` — and installs it into the call's `.pi/extensions/` directory, where Pi loads it automatically at startup. **No `/reload`, nothing to configure.** The extension tails the live transcript and, whenever the talkers pause, feeds the new lines to Pi with `pi.sendMessage(..., { triggerTurn: true })` — which actually starts a turn, so Pi *reads and reasons over* each batch rather than waiting to be asked. Guided by its prompt, Pi leaves a one-line `·` summary of what they just covered on every batch (so you can follow the call live) and escalates to a `👋` interjection only when something matters: a risk or bug, a decision worth capturing, an action item, a correction, or a line addressed to it directly.

Crucially, the watcher only triggers a turn while Pi is idle, so **your own messages always take priority** — when you talk to Pi it answers you first, and the instant it finishes the next batch of call activity arrives and it keeps listening. The poll loop lives for the whole session: a question from you never pauses or ends the watch, and batches keep coming until the call ends. The transcript files remain the source of truth — if the watcher ever stalls, Pi just reads `transcriptions.jsonl` and `events.jsonl` directly.

Pi opens with a one-line "listening and caught up" confirmation, leaves a quick `·` summary on each batch thereafter, and writes checkpoint and final summaries around `recording_stopped` and `call_ended`.

## Prerequisites

- macOS
- [Pi](https://pi.dev/) installed so `pi` works in a new terminal, with a provider authenticated (`pi`, then `/login`)
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/open-in-pi/`

The trigger fires the next time call transcription starts.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the current call transcription artifacts. This trigger:

1. Copies the shipped `tuple-call-watch.ts` into `.pi/extensions/` inside that directory and writes a `tuple-call-watch.config.json` next to it (the artifacts directory and call id).
2. Writes `pi-sidekick-prompt.md` into that directory.
3. Writes an executable `open-in-pi.command` wrapper into that directory.
4. Opens the wrapper through macOS with `/usr/bin/open`.
5. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `pi "$(cat pi-sidekick-prompt.md)"`. Pi auto-discovers `.pi/extensions/*.ts` from that directory, so the watcher is active immediately.

The watcher (`tuple-call-watch.ts`) tails `transcriptions.jsonl` and `events.jsonl` (plus sibling directories for the same call) from saved byte offsets, resolves `user_id` to speaker names, and batches new lines on natural pauses (a ~3.5s lull, or every ~20s during continuous talking). It only feeds a batch — and only triggers a turn — while Pi is idle and has no pending messages, so consumption never collides with your messages or with itself. It degrades safely: if its config is missing it watches the working directory, and any error is swallowed rather than taking down the session.

For local script testing without opening a terminal, set `OPEN_IN_PI_DRY_RUN=1` — it still installs the extension so you can inspect it.
