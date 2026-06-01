# Open in Pi

Launches [Pi](https://pi.dev/) in the current Tuple transcription directory when transcription starts.

The trigger writes an `open-in-pi.command` wrapper next to the live transcript files and asks macOS to open it. The wrapper runs as `#!/bin/zsh -li`, so `pi` is resolved from the same interactive shell environment you get in a new terminal. No install location or model is hard-coded — Pi uses whichever provider and model you have configured as your default.

## What makes this one different

Most editor sidekicks can only check the transcript when you speak to them. Pi can extend itself at runtime, so the prompt asks it to **configure its own monitoring**: write a small watcher extension into `.pi/extensions/` that tails `transcriptions.jsonl` and `events.jsonl` from a saved offset. New lines surface live in the TUI through `ctx.ui.notify` even while Pi sits idle, and the `before_agent_start` event re-injects them into context so Pi is always caught up the moment it next speaks. You can keep chatting with Pi the whole time — conversing and watching are one continuous activity, so a question never stops the watch.

Pi cannot reload its own extension files, so it writes the watcher and then asks you to run `/reload` once to activate it; until you reload, it is honest that it is still on the fallback path. If self-extension isn't available or worthwhile in your environment, Pi falls back to per-turn catch-up polling — the same model the other transcription sidekicks use — so the trigger is useful either way. It always treats the transcript files as the source of truth.

Beyond monitoring, Pi catches up on the existing transcript, responds when addressed by name, logs the conversation as dot-lines, and writes checkpoint/final summaries around transcription and call lifecycle events.

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

1. Writes `pi-sidekick-prompt.md` into that directory.
2. Writes an executable `open-in-pi.command` wrapper into that directory.
3. Opens the wrapper through macOS with `/usr/bin/open`.
4. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `pi "$(cat pi-sidekick-prompt.md)"`.

For local script testing without opening a terminal, set `OPEN_IN_PI_DRY_RUN=1`.
