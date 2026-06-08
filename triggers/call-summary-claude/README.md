# Call Summary - Claude

Launches [Claude Code](https://claude.com/claude-code) when Tuple transcription completes and asks it to summarize the completed transcript.

The trigger writes a `launch-call-summary-claude.command` wrapper next to the transcript files and opens it in your preferred terminal. The wrapper runs as `#!/bin/zsh -li`, so `claude` resolves from the same interactive shell environment you get in a new terminal. No install location is hard-coded.

Claude starts in the transcription directory with a focused summary prompt. It reads the whole call by running Tuple's bundled watcher (`tuple-call-watcher.py --catchup`, shipped with this trigger), produces a concise summary with decisions, action items, and open questions, then stays available for transcript-backed follow-up questions.

## Prerequisites

- macOS
- [Claude Code](https://claude.com/claude-code) installed so `claude` works in a new terminal
- `python3` (the bundled watcher needs it; install with `xcode-select --install`)
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/call-summary-claude/`

The trigger fires when call transcription completes.

## How it works

When `call-transcription-complete` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the completed transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` and writes `call-summary-claude-prompt.md` into that directory.
2. Writes an executable `launch-call-summary-claude.command` wrapper into that directory.
3. Opens it in your preferred terminal via `open` (Ghostty → iTerm → Alacritty → Terminal; set `PREFERRED_TERM` to choose). No AppleScript, so it triggers no macOS accessibility prompt.
4. The wrapper starts a login interactive zsh shell, changes into the transcription directory, and runs `claude --allowed-tools Read Bash --name "Tuple Call Summary - Claude" -- "$(cat call-summary-claude-prompt.md)"`.

For local script testing without opening a terminal, set `CALL_SUMMARY_CLAUDE_DRY_RUN=1`.
