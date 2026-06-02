# Pi Transcript Summary

Launches [Pi](https://pi.dev/) when Tuple transcription completes and asks it to summarize the completed transcript.

The trigger writes a `summarize-in-pi.command` wrapper next to the transcript files and asks macOS to open it. The wrapper runs as `#!/bin/zsh -li`, so `pi` resolves from the same interactive shell environment you get in a new terminal. Nothing is hard-coded: Pi uses whichever provider and model you have configured as your default.

Pi starts in the transcription directory with a focused summary prompt. It reads `events.jsonl` and `transcriptions.jsonl`, produces a concise summary with decisions, action items, and open questions, then stays available for transcript-backed follow-up questions.

## Prerequisites

- macOS
- [Pi](https://pi.dev/) installed so `pi` works in a new terminal, with a provider authenticated (`pi`, then `/login`)
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/pi-transcript-summary/`

The trigger fires when call transcription completes.

## How it works

When `call-transcription-complete` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the completed transcription artifacts. This trigger:

1. Writes `pi-summary-prompt.md` into that directory.
2. Writes an executable `summarize-in-pi.command` wrapper into that directory.
3. Opens the wrapper through macOS with `/usr/bin/open`.
4. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `pi "$(cat pi-summary-prompt.md)"`.

For local script testing without opening a terminal, set `PI_TRANSCRIPT_SUMMARY_DRY_RUN=1`.
