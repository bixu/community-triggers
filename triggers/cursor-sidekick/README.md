# Cursor Sidekick

Launches the [Cursor CLI agent](https://cursor.com/cli) as a live companion on your Tuple call when transcription starts.

When `call-transcription-started` fires, this trigger opens your preferred terminal running `cursor-agent` inside the call's transcription directory. Cursor catches up on everything said so far, then follows the live transcript and acts as a sharp third pair on the call.

## What it does

- **Logs the call live.** On every batch of new transcript, Cursor leaves a one-line `·` play-by-play so you can follow along at a glance.
- **Chimes in when it matters.** It escalates from a log line to a real interjection for a bug it can see, an ambiguous decision or action item, a correction, or a direct question.
- **Answers when addressed.** Say "Cursor, ..." (or type into the terminal) and it responds to that turn, then keeps following the call.
- **Summarizes.** It writes a checkpoint summary when recording stops and a final summary (decisions, action items, open threads) when the call ends.

Cursor follows the call with **Tuple's bundled watcher** (`tuple-call-watcher.py`), shipped with this trigger and run verbatim: a fixed, deterministic script rather than a watch loop the model re-authors each session. This is the same watcher the Codex, Claude, and OpenCode sidekicks use. Since the Cursor CLI has no event-driven wake (no equivalent of Claude Code's `Monitor`), it runs the watcher once with `--catchup`, then repeatedly in `--exit-on-batch` mode (each run blocks until the next batch, prints it, and exits). The Cursor agent runs shell commands synchronously and blocking, so a quiet stretch simply parks in the watcher until the next words land.

The prompt is passed as the initial message and no `-p` flag is used, so Cursor stays interactive afterward and you can type to it during the call.

## Permissions

This trigger does **not** launch Cursor with a blanket auto-approve (`--force` / `--yolo`). Instead it pre-authorizes **only the bundled watcher** and leaves everything else to your own Cursor approval settings.

It does this by writing a project-scoped allowlist to `<transcripts-root>/.cursor/cli.json` (Cursor's working directory for the session):

```json
{ "permissions": { "allow": ["Shell(*/tuple-call-watcher.py)"], "deny": [] } }
```

Cursor's `Shell(<base>)` rules match on the command's first token, so this permits `./<session-dir>/tuple-call-watcher.py ...` (every session directory, including mid-call restarts) — and nothing else. The watcher loop runs unattended; any other command the agent attempts goes through your normal Cursor approval flow. The file is written only if you don't already have a `.cursor/cli.json` there, so a setup you manage yourself is never overwritten.

Two things to expect on first launch:

- **Directory trust.** Cursor asks once whether you trust the transcripts directory. Accept it to proceed (this is separate from command approval).
- **Approval mode.** Whether allowlisted commands run silently depends on your global Cursor approval mode (`~/.cursor/cli-config.json`). With the default allowlist mode the watcher runs unattended; if your mode prompts for everything, approve the watcher once with "don't ask again."

If you'd rather run with Cursor's blanket auto-approve anyway, export `CURSOR_SIDEKICK_FORCE=1` in your shell profile before the trigger fires (off by default).

## Choosing your terminal

By default the trigger opens the first installed of **Ghostty → iTerm → Alacritty → Terminal**. To force one, set `PREFERRED_TERM` at the top of `call-transcription-started` (or in the environment):

```bash
PREFERRED_TERM="iterm"   # ghostty | iterm | alacritty | terminal
```

The terminal runs `launch-cursor-sidekick.command`, whose `#!/bin/zsh -li` shebang sources your `~/.zprofile` and `~/.zshrc`, so `cursor-agent` resolves from the same PATH and environment you get in a normal terminal.

## Prerequisites

- macOS
- [Cursor CLI](https://cursor.com/cli) installed so `cursor-agent` works in a new terminal. Run it once first to sign in (and to clear any one-time workspace-trust prompt).
- `python3` (the bundled watcher needs it; install with `xcode-select --install`)
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/cursor-sidekick/`

The trigger fires the next time call transcription starts.

## How it works

When `call-transcription-started` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the current call transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` and writes `cursor-sidekick-prompt.md` into that directory.
2. Writes an executable `launch-cursor-sidekick.command` wrapper into that directory.
3. Opens it in your preferred terminal via `open` (Ghostty → iTerm → Alacritty → Terminal; set `PREFERRED_TERM` to choose). No AppleScript, so it triggers no macOS accessibility prompt.
4. The wrapper starts a login-interactive zsh shell, changes to the transcripts root, and runs `cursor-agent --force "$(cat cursor-sidekick-prompt.md)"`; Cursor runs the bundled watcher to catch up and follow the call.

For local script testing without opening a terminal, set `CURSOR_SIDEKICK_DRY_RUN=1`. It still ships the watcher and writes the launcher so you can inspect them.
