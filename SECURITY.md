# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub Security Advisories instead of opening a public issue. Include reproduction steps, affected files, and the expected impact when possible.

## Local data model

The original Concept Loom adapter runs as a local stdio MCP server without a network listener. Learning notes and resumable state stay inside the selected workspace. Existing junctions and symbolic links are checked before reads/writes. This is not an operating-system sandbox against another local process replacing paths concurrently. Session writes use an atomic rename and a per-session directory lock. If a client crashes while holding a lock, close all clients before removing only the reported `.json.lock` directory and retrying.

ConceptLoom Desktop stores sources, progress and settings in its local SQLite application directory. It is not encrypted at rest. Ollama requests are restricted to HTTP loopback. Account providers send selected source excerpts, answers and conversation context through an official CLI only after saved consent. Consent can be revoked in Settings; it blocks future requests, not an already running request. CLI credentials remain owned by the CLI; the app does not copy tokens into SQLite. See [account boundaries and limits](docs/account-providers.md).

The connected AI client may still read local source materials or use network tools according to that client's permissions. Review the client's permission prompts and avoid placing credentials or unrelated private files in a learning workspace.

## Before publishing a fork

- Do not commit `.env`, `.mcp.json`, `opencode.json`, DeepSeek Harness profile configuration, credentials, private keys, books, courses, or generated learning state.
- Inspect `git diff --cached` before every push.
- If a secret was ever committed, revoke it first; removing it in a later commit is not sufficient.
