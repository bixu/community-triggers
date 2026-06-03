# Open in OpenCode

Launches [OpenCode](https://opencode.ai/) in the current Tuple transcription directory when transcription starts.

The trigger writes an `launch-opencode-sidekick.command` wrapper next to the live transcript files and opens it in your preferred terminal. The wrapper runs as `#!/bin/zsh -li`, so `opencode` is resolved from the same interactive shell environment you get in a new terminal. No install location is hard-coded.

OpenCode follows the call with **Tuple's bundled watcher** (`tuple-call-watcher.py`), shipped with this trigger and run verbatim: a fixed, deterministic script rather than a watch loop the model re-authors each session. Since OpenCode has no event-driven wake, it runs the watcher once with `--catchup`, then repeatedly in `--exit-on-batch` mode. It logs the call live, responds when addressed by name, and writes checkpoint and final summaries around transcription and call lifecycle events.

## Prerequisites

- macOS
- [OpenCode](https://opencode.ai/) installed so `opencode` works in a new terminal
- `python3` (the bundled watcher needs it; install with `xcode-select --install`)
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/open-in-opencode/`

The trigger fires the next time call transcription starts.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the current call transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` and writes `opencode-sidekick-prompt.md` into that directory.
2. Writes an executable `launch-opencode-sidekick.command` wrapper into that directory.
3. Opens it in your preferred terminal via `open` (Ghostty → iTerm → Alacritty → Terminal; set `PREFERRED_TERM` to choose). No AppleScript, so it triggers no macOS accessibility prompt.
4. The wrapper starts a login interactive zsh shell, changes to the transcripts root, and runs `opencode . --prompt "$(cat opencode-sidekick-prompt.md)"`; OpenCode runs the bundled watcher to catch up and follow the call.

For local script testing without opening a terminal, set `OPEN_IN_OPENCODE_DRY_RUN=1`.
