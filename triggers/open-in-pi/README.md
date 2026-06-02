# Open in Pi

Launches [Pi](https://pi.dev/) in the current Tuple transcription directory when transcription starts.

The trigger writes an `open-in-pi.command` wrapper next to the live transcript files and asks macOS to open it. The wrapper runs as `#!/bin/zsh -li`, so `pi` is resolved from the same interactive shell environment you get in a new terminal. No install location or model is hard-coded — Pi uses whichever provider and model you have configured as your default.

## What makes this one different

Most editor sidekicks can only check the transcript when you speak to them. This trigger ships a Pi extension — `tuple-call-watch.ts` — and installs it into the call's `.pi/extensions/` directory, where Pi loads it automatically at startup. **No `/reload`, nothing to configure.** Pi's extension API makes this possible: the watcher uses `ctx.ui.notify` to post new transcript lines to the TUI live (with speaker names resolved) even while Pi sits idle, and the `before_agent_start` event to inject everything new — plus the full backlog from before Pi started — into context at the start of each turn. So the call shows in the terminal as it happens, and the moment you talk to Pi it already has the whole conversation.

Because the watcher runs independently of Pi's turns and stays armed for the whole session, you can keep chatting with Pi the entire call — conversing and watching are one continuous activity, so a question never pauses or stops the watch. The transcript files remain the source of truth: if the watcher ever stalls, Pi just reads `transcriptions.jsonl` and `events.jsonl` directly.

Pi responds when addressed by name ("Pi, …"), and writes checkpoint and final summaries around `recording_stopped` and `call_ended`.

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

The watcher (`tuple-call-watch.ts`) tails `transcriptions.jsonl` and `events.jsonl` (plus sibling directories for the same call) from saved byte offsets, resolves `user_id` to speaker names, and degrades safely: if its config is missing it watches the working directory, and any error is swallowed rather than taking down the session.

For local script testing without opening a terminal, set `OPEN_IN_PI_DRY_RUN=1` — it still installs the extension so you can inspect it.
