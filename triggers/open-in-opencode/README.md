# Open in OpenCode

Launches [OpenCode](https://opencode.ai/) in the current Tuple transcription directory when transcription starts.

The trigger writes an `open-in-opencode.command` wrapper next to the live transcript files and asks macOS to open it. The wrapper runs as `#!/bin/zsh -li`, so `opencode` is resolved from the same interactive shell environment you get in a new terminal. No install location is hard-coded.

OpenCode starts in the current transcription directory with an initial prompt modeled after Tuple's in-app "Open in Codex" sidekick prompt. It catches up on `events.jsonl` and `transcriptions.jsonl`, then watches for new transcript lines, responds when addressed by name, and writes checkpoint/final summaries around transcription and call lifecycle events.

## Prerequisites

- macOS
- [OpenCode](https://opencode.ai/) installed so `opencode` works in a new terminal
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/open-in-opencode/`

The trigger fires the next time call transcription starts.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the current call transcription artifacts. This trigger:

1. Writes `opencode-sidekick-prompt.md` into that directory.
2. Writes an executable `open-in-opencode.command` wrapper into that directory.
3. Opens the wrapper through macOS with `/usr/bin/open`.
4. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `opencode . --prompt "$(cat opencode-sidekick-prompt.md)"`.

For local script testing without opening a terminal, set `OPEN_IN_OPENCODE_DRY_RUN=1`.
