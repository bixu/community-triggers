# OpenCode Transcript Summary

Launches [OpenCode](https://opencode.ai/) when Tuple transcription completes and asks it to summarize the completed transcript.

The trigger writes a `summarize-in-opencode.sh` wrapper next to the transcript files and opens it in your preferred terminal. The wrapper runs as `#!/bin/zsh -li`, so `opencode` is resolved from the same interactive shell environment you get in a new terminal. No install location is hard-coded.

OpenCode starts in the transcription directory with a focused summary prompt. It reads `events.jsonl` and `transcriptions.jsonl`, produces a concise summary with decisions, action items, and open questions, then stays available for transcript-backed follow-up questions.

## Prerequisites

- macOS
- [OpenCode](https://opencode.ai/) installed so `opencode` works in a new terminal
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/opencode-transcript-summary/`

The trigger fires when call transcription completes.

## How it works

When `call-transcription-complete` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the completed transcription artifacts. This trigger:

1. Writes `opencode-summary-prompt.md` into that directory.
2. Writes an executable `summarize-in-opencode.sh` wrapper into that directory.
3. Opens it in your preferred terminal (Ghostty → iTerm → Alacritty → Terminal; set `PREFERRED_TERM` to choose), falling back to Terminal.app.
4. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `opencode . --prompt "$(cat opencode-summary-prompt.md)"`.

For local script testing without opening a terminal, set `OPENCODE_TRANSCRIPT_SUMMARY_DRY_RUN=1`.
