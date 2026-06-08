# Call Summary - Claude Cowork

A [Tuple](https://tuple.app) trigger that opens [Claude Cowork](https://www.anthropic.com/product/claude-cowork) when call transcription completes and preloads a summary prompt against the call's raw transcript artifacts.

## What it does

When `call-transcription-complete` fires, the trigger:

- Finds the transcription artifact directory from `TUPLE_TRIGGER_CALL_ARTIFACTS_DIRECTORY`.
- Verifies at least one `transcriptions.jsonl` exists.
- Opens `claude://cowork/new` with that artifact directory attached as a folder.
- Prefills a prompt asking Cowork to summarize the call and write `call-summary.md` into the same artifact directory.

Claude Cowork opens with a draft prompt. Review it, confirm folder access if prompted, and press Enter to run the summary.

The prompt asks for an executive summary, decisions, action items, open questions, and a follow-up message draft when useful. If transcription stopped while the call still appears to be ongoing, Cowork is instructed to call that out and summarize the conversation so far.

## Requirements

- macOS.
- Claude Desktop with Cowork enabled.
- Tuple transcription enabled for the call.

Claude Desktop may ask you to confirm access to the attached call artifact folder before Cowork can read or write files there.

## Installation

Drop this directory into your Tuple triggers folder:

- Production: `~/.tuple/triggers/call-summary-claude-cowork/`
- Staging: `~/.tuplestaging/triggers/call-summary-claude-cowork/`

The trigger fires automatically the next time call transcription completes.
