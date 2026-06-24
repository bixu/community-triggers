# Slack Call Summary - Claude

Headlessly runs [Claude Code](https://claude.com/claude-code) when Tuple transcription completes: it summarizes the call, writes a title and summary back onto the call (Tuple's Call History), posts a one-line header to a Slack channel (set via `TUPLE_SLACK_CHANNEL`), and leaves the full summary as a threaded draft reply for you to edit before sending. Everyone referenced in the call is resolved via the Slack MCP and rendered as a real `@`-mention.

Unlike the interactive `call-summary-claude` trigger, this one runs entirely in the background — no terminal window, no UI. A few minutes after your call ends you'll see the header land in the channel and an unsent draft waiting in that thread, plus the summary showing up on the call.

It's a one-shot over the finished call — no `tuple connect`, nothing live to follow. Claude finds the call, reads its stored transcript with the `tuple` CLI, and does the work.

## Prerequisites

- macOS
- [Claude Code](https://claude.com/claude-code) installed so `claude` works in a new terminal
- The `tuple` CLI on your interactive shell PATH (with `transcription` support)
  - Install it from the Tuple app: its Transcription settings have an **Install** button that links `tuple` onto your PATH.
- A Slack MCP server or connector available to Claude Code. The **claude.ai Slack connector** works out of the box — verify with `claude mcp list` (you should see `claude.ai Slack: Connected`); connect it from [claude.ai](https://claude.ai) → Settings → Connectors, or run `/mcp` inside Claude Code. Any other Slack MCP works too, as long as its tools are allowed in your Claude Code permission settings (or you add its `mcp__<server>` rule to the allowlist in [call-transcription-complete](./call-transcription-complete)).
- Tuple transcription enabled for the call

## Installation

Drop this directory into your Tuple triggers folder:

`~/.tuple/triggers/slack-call-summary-claude/`

The trigger fires when call transcription completes.

## Configuration

The target channel comes from the `TUPLE_SLACK_CHANNEL` environment variable (a channel name, with or without a leading `#`). Tuple launches triggers outside your interactive shell, so a plain `export` in `~/.zshrc`/`~/.bashrc` won't reach the trigger — set it through `launchctl` so the Tuple trigger host inherits it:

```sh
launchctl setenv TUPLE_SLACK_CHANNEL your-channel
```

`launchctl setenv` doesn't persist across reboots; add the same line to a login item (or a `launchd` agent) if you want it to survive a restart. Alternatively, edit the default directly in [call-transcription-complete](./call-transcription-complete):

```sh
TUPLE_SLACK_CHANNEL="${TUPLE_SLACK_CHANNEL:-your-channel}"   # the default if the env var is unset
```

If the channel can't be resolved to an unambiguous match (including the unconfigured `your-channel` placeholder), the run reports a delivery failure rather than posting somewhere unexpected.

The summary body is created as a **draft**, not sent — you review and edit it in Slack, then send it yourself. Slack allows only one attached draft per channel, so if an earlier draft is still unsent in the target channel the run reports `draft_already_exists` instead of overwriting it; clear that draft first.

The summary body is created as a **draft**, not sent — you review and edit it in Slack, then send it yourself. Slack allows only one attached draft per channel, so if an earlier draft is still unsent in the target channel the run reports `draft_already_exists` instead of overwriting it; clear that draft first.

## How it works

`call-transcription-complete` fires with no call-specific arguments. This trigger:

1. Writes `slack-call-summary-claude-prompt.md` into a working directory (`${TMPDIR:-/tmp}/tuple-slack-call-summary-claude/<timestamp>-<pid>`), including the configured channel and all instructions.
2. Headlessly launches a login zsh (`nohup zsh -lc`, so `claude` and `tuple` resolve from your normal PATH — no terminal window) that runs `claude -p` in that directory with the prompt on stdin and a scoped tool allowlist: `Read`, `Bash`, `Write(slack-call-summary-claude-failed.md)`, and `mcp__claude_ai_Slack`. In `-p` print mode any tool outside the allowlist is auto-denied — `Bash` lets Claude run the `tuple` CLI, and the Slack tools let it search, post, and draft; nothing else.
3. Claude finds the call (`tuple call current` / `tuple transcription list`), reads it (`tuple transcription show <id> --with-events`), resolves each participant to a Slack `@`-mention (`slack_search_users`), writes the title + summary back (`tuple transcription set-title` / `set-summary`), posts the header line (`slack_send_message`), and creates the summary body as a threaded draft reply (`slack_send_message_draft` with `thread_ts`).

## Troubleshooting

- **Trigger not firing**: Check `/tmp/tuple-trigger-debug.log` — the banner `call-transcription-complete fired (slack-call-summary-claude)` appears each time the trigger runs.
- **No header/draft and no error**: Check `slack-call-summary-claude.log` in the working directory (printed at launch) for the Claude run output.
- **`draft_already_exists`**: An earlier unsent draft is still attached to the channel. Send or discard it in Slack, then the next run can create a fresh one.
- **Slack delivery failed**: Look for `slack-call-summary-claude-failed.md` in the working directory — it contains the composed message and the error.
- **`claude not found` / `tuple not found`**: Make sure both are on your login-shell PATH (test with `zsh -l -c 'which claude tuple'`).
- **Slack connector not available**: Run `claude mcp list` and confirm `claude.ai Slack: Connected`.

## Dry run

To test the trigger without launching Claude, set `SLACK_CALL_SUMMARY_CLAUDE_DRY_RUN=1`. The trigger generates the prompt file and exits — nothing is sent to Slack. (Output goes to `/tmp/tuple-trigger-debug.log`.)
