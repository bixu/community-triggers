# Slack Call Summary - Claude

Headlessly runs [Claude Code](https://claude.com/claude-code) when Tuple transcription completes and sends a summary of the call to you as a Slack DM.

Unlike the interactive `call-summary-claude` trigger, this one runs entirely in the background — no terminal window, no UI. You see nothing except a Slack DM arriving a few minutes after your call ends.

## Prerequisites

- macOS
- [Claude Code](https://claude.com/claude-code) installed so `claude` works in a new terminal
- `python3` (the bundled watcher needs it; install with `xcode-select --install`)
- A Slack MCP server or connector available to Claude Code. The **claude.ai Slack connector** works out of the box — verify it with `claude mcp list` (you should see `claude.ai Slack: Connected`); connect it from [claude.ai](https://claude.ai) → Settings → Connectors, or run `/mcp` inside Claude Code. Any other Slack MCP works too, as long as its tools are allowed in your Claude Code permission settings (or you add its `mcp__<server>` rule to the allowlist in the runner — allow rules can't glob server names).
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/slack-call-summary-claude/`

The trigger fires when call transcription completes.

## Configuration

By default the summary is sent as a DM to yourself (the authenticated Slack user). To send to a different person or channel, edit the `SLACK_RECIPIENT=` line near the top of [call-transcription-complete](./call-transcription-complete):

```sh
SLACK_RECIPIENT="${SLACK_RECIPIENT:-#my-channel}"     # a channel
SLACK_RECIPIENT="${SLACK_RECIPIENT:-@jack}"           # another user by handle
SLACK_RECIPIENT="${SLACK_RECIPIENT:-Jack Hannah}"     # another user by display name
```

Leave it empty (the default) to DM yourself. The environment variable form also works, but Tuple launches triggers outside your shell, so an `export` in your shell rc won't reach it — use `launchctl setenv SLACK_RECIPIENT "#my-channel"` if you prefer the environment route.

## How it works

When `call-transcription-complete` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the completed transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` into that directory.
2. Writes `slack-call-summary-claude-prompt.md` into that directory, including the configured recipient and all transcript-reading instructions.
3. Writes an executable `run-slack-call-summary-claude.zsh` runner into that directory.
4. Launches the runner headlessly with `nohup` — no terminal window, no user interaction required.
5. The runner starts a login zsh shell (`#!/bin/zsh -l`), changes into the transcription directory, and runs `claude -p` with a scoped tool allowlist: `Read`, `Write(slack-call-summary-claude-failed.md)`, `Bash(./tuple-call-watcher.py:*)`, `Bash(python3 tuple-call-watcher.py:*)`, and `mcp__claude_ai_Slack`. In `-p` print mode any tool outside the allowlist is auto-denied, so Claude can read the transcript and send the Slack message but not write or run anything else.
6. Claude reads the transcript via `./tuple-call-watcher.py --catchup`, composes the summary, and sends it via the Slack MCP connector.

## Artifacts left in the transcription directory

| File | Contents |
| --- | --- |
| `tuple-call-watcher.py` | The bundled transcript watcher |
| `slack-call-summary-claude-prompt.md` | The prompt injected into Claude |
| `run-slack-call-summary-claude.zsh` | The headless runner script |
| `slack-call-summary-claude.pid` | PID of the runner (guards duplicate runs) |
| `slack-call-summary-claude.log` | stdout/stderr from the Claude run |
| `slack-call-summary-claude-failed.md` | Written only if Slack delivery fails |

## Troubleshooting

- **Trigger not firing**: Check `/tmp/tuple-trigger-debug.log` — the banner `call-transcription-complete fired (slack-call-summary-claude)` appears each time the trigger runs.
- **No Slack DM and no error**: Check `slack-call-summary-claude.log` in the transcription directory for the Claude run output.
- **Slack delivery failed**: Look for `slack-call-summary-claude-failed.md` in the transcription directory — it contains the composed message and the error.
- **`claude not found`**: Make sure `claude` is on your login-shell PATH (test with `zsh -l -c 'which claude'`).
- **Slack connector not available**: Run `claude mcp list` and confirm `claude.ai Slack: Connected`. If missing, connect it from claude.ai → Settings → Connectors.

## Dry run

To test the trigger without launching Claude, set `SLACK_CALL_SUMMARY_CLAUDE_DRY_RUN=1`. The trigger generates the prompt and runner files and exits — nothing is sent to Slack.

```sh
TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY=/path/to/fake-session \
SLACK_CALL_SUMMARY_CLAUDE_DRY_RUN=1 \
./call-transcription-complete
```
