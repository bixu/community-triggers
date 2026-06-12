# Slack Call Summary - Codex

Headlessly runs [Codex](https://developers.openai.com/codex/cli/) when Tuple transcription completes and sends a summary of the call to you as a Slack DM.

Unlike the interactive `call-summary-codex` trigger, this one runs entirely in the background — no terminal window opens. The summary arrives in Slack a few minutes after your call ends, while you're already on to the next thing.

## Prerequisites

- macOS
- [Codex](https://developers.openai.com/codex/cli/) installed so `codex` works in a new terminal
- `python3` (the bundled watcher needs it; install with `xcode-select --install`)
- A Slack connector available to Codex with a `slack_send_message` tool. The OpenAI-curated Slack plugin works out of the box — enable it and sign in so `codex` has the Slack tools available.
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/slack-call-summary-codex/`

The trigger fires when call transcription completes.

## Configuration

By default the summary arrives as a Slack DM to yourself (the authenticated Slack user). To send elsewhere, edit the `SLACK_RECIPIENT=` line near the top of [call-transcription-complete](./call-transcription-complete):

```sh
SLACK_RECIPIENT="${SLACK_RECIPIENT:-#my-channel}"   # a channel
SLACK_RECIPIENT="${SLACK_RECIPIENT:-@jane}"         # another user's handle
SLACK_RECIPIENT="${SLACK_RECIPIENT:-Jane Smith}"    # display name — Codex resolves it
```

Leave it empty to DM yourself. The environment variable form also works, but Tuple launches triggers outside your shell, so an `export` in your shell rc won't reach it — use `launchctl setenv SLACK_RECIPIENT "#my-channel"` if you prefer the environment route.

## How it works

When `call-transcription-complete` fires, Tuple provides `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`, the directory containing the completed transcription artifacts. This trigger:

1. Copies the fixed `tuple-call-watcher.py` into that directory.
2. Writes `slack-call-summary-codex-prompt.md` into that directory, including the configured recipient and all transcript-reading instructions.
3. Writes an executable `run-slack-call-summary-codex.zsh` runner into that directory.
4. Launches the runner headlessly with `nohup … &` + `disown`. No terminal window opens.
5. The runner starts a login zsh shell (so `codex` resolves from your normal PATH), changes into the transcription directory, and runs `codex exec` with the summary prompt.
6. Codex reads the transcript via `./tuple-call-watcher.py --catchup`, composes the summary message, and sends it using its Slack connector tools.

### A note on sandboxing

The runner passes `--dangerously-bypass-approvals-and-sandbox` to `codex exec`. This is required, not a convenience: in non-interactive `exec` mode Codex auto-cancels any approval-gated connector tool call (`user cancelled MCP tool call`) because there is no user present to approve it, and as of Codex 0.139 no `apps.*` / `mcp_servers.*` `approval_mode` configuration suppresses that (see [openai/codex#24135](https://github.com/openai/codex/issues/24135)). Without the flag, the Slack send always fails.

The prompt is fixed, but the transcript it reads is not: call transcripts are speech-to-text of whatever was said (or shown) on the call, which makes them untrusted input to an unsandboxed, unattended agent. If that trade-off doesn't work for you, use the Claude variant of this trigger (which runs with a scoped tool allowlist) or the interactive `call-summary-codex` trigger (read-only sandbox) instead. If a later Codex release lets `exec` approve connector tools via configuration (watch the linked issue), the bypass flag here can be replaced with `--sandbox workspace-write` plus that configuration.

## Artifacts left in the transcription directory

| File | Contents |
| --- | --- |
| `tuple-call-watcher.py` | Deterministic transcript reader (copied from the trigger) |
| `slack-call-summary-codex-prompt.md` | The full prompt sent to Codex |
| `run-slack-call-summary-codex.zsh` | The headless runner script |
| `slack-call-summary-codex.pid` | PID of the running Codex process (guards duplicate runs) |
| `slack-call-summary-codex.log` | stdout/stderr from the Codex run |
| `slack-call-summary-codex-last-message.md` | Always written — the final Codex agent message |
| `slack-call-summary-codex-failed.md` | Written only if Slack delivery fails (contains the undelivered summary) |

## Troubleshooting

- **Trigger not firing**: Check `/tmp/tuple-trigger-debug.log` — every trigger invocation appends a banner there with its environment.
- **Codex run fails or hangs**: Check `slack-call-summary-codex.log` in the transcription directory for the runner's output.
- **The Slack message never arrived**: Check `slack-call-summary-codex-last-message.md` for the final agent message. If Slack delivery failed, Codex writes the composed message to `slack-call-summary-codex-failed.md` instead.
- **Codex not found**: Make sure `codex` is on your login-shell PATH. Open a new terminal and run `codex --version` to confirm. The runner uses `#!/bin/zsh -l` (login shell) to pick up the same PATH you see in a fresh terminal.
- **Slack connector not available**: Open `codex` in a terminal and confirm the Slack plugin is signed in. The prompt tells Codex to write a fallback file if the tools are unavailable.

## Dry run

To test the trigger without launching Codex, set `SLACK_CALL_SUMMARY_CODEX_DRY_RUN=1`. The script generates the prompt and runner files and exits without starting a background process:

```sh
TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY=/path/to/session \
SLACK_CALL_SUMMARY_CODEX_DRY_RUN=1 \
./call-transcription-complete
```
