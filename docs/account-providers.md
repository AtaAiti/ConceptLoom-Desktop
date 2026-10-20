# Account AI providers — Desktop 0.3.0

## Connect an account

1. Open Settings and select AI provider: Ollama, ChatGPT · Codex,
   Claude · Claude Code, or Gemini · Google.
2. For an account provider, choose Install / update client if needed. Managed
   installation needs Node.js 22+ with npm; packages are installed inside the
   application's data directory, without changing global npm packages.
3. Click Sign in. A separate official client window opens. Complete login in the
   browser. Codex uses ChatGPT login; Claude uses Claude account login rather than
   API Console; Gemini uses Login with Google. Close the client window after login.
4. Refresh status and click Test response. This sends a fixed generic prompt,
   without learning materials, and consumes the account's normal usage allowance.
5. Keep model `default` for the official client's default, choose a Claude alias
   (`sonnet`, `opus`, `haiku`), or enter an accessible model ID. A preset is not a
   guarantee of entitlement. Test the selected model to verify access.
6. Allow learning context transfer and save. The saved provider is used by route
   generation, lessons, open-answer grading and tutor conversations.

Switching providers remembers model names and preserves the Ollama loopback URL.
Context consent must be given again when switching to another provider. There is
no silent fallback to a different provider, API billing or local model. Saved
learning progress remains in the same SQLite database.

An ordinary web chat subscription is not a universal authorization mechanism.
The official client must accept that particular account and model. Gemini offers
Google account authentication, including eligible free access; exact account
eligibility, regions, quotas and subscription benefits are controlled by Google.
Claude Code and Codex likewise enforce their own account eligibility and limits.
This integration delegates to official CLI account authentication; it does not
implement a third-party OAuth application or extract browser/CLI tokens.

## Process boundary

- The webview sends a provider enum, model name, conversation and optional JSON
  schema to native Rust commands. It cannot supply a command, executable or path.
- Native generation re-reads saved provider, model and context consent from SQLite
  before starting a process. The generic connection test accepts no user prompt.
- Models have a 200-byte allowlist, requests have role/count/size limits, and all
  variable arguments are passed directly to a process, never interpolated in a shell.
- Prompt text and schema go through stdin. Each request has a fresh temporary
  working directory; the repository and learning database are not the client cwd.
- API-key and endpoint override variables are removed from child environments.
  CLI credential storage remains owned by the official client. Passwords, tokens,
  email addresses and raw client diagnostics are not returned to the webview.
- Request stdout/stderr are bounded to 2 MiB each, inference times out after ten
  minutes, and Windows timeouts terminate the owned process tree. Errors preserve
  progress and require retry or another model; raw stderr is not displayed.
- Codex ignores user config, disables shell/apps/plugins/hooks/browser/image/
  agent features and host skill discovery, uses a read-only sandbox and ephemeral
  sessions. Only the final assistant response file is returned.
- Claude uses safe and restricted modes, no built-in tools, no MCP tools, an empty
  strict MCP config, disabled hooks/auto memory, and no session persistence.
- Gemini uses enforced Google OAuth, system settings disabling extensions, MCP,
  hooks, skills and agents, a replaced system prompt and an admin deny-all tool
  policy. If central admin policy files would suppress the supplied policy, the
  bridge refuses to run. Its CLI `@file`/`!command` preprocessing is neutralized by
  Unicode escapes inside the JSON prompt; decoded learning text is unchanged.
- Provider JSON envelopes and JSON syntax are checked natively. Task-specific Zod
  validation checks the result before application state can advance. Structured
  requests include the schema in the conversation rather than relying on an
  identical structured-output CLI flag across providers. Invalid JSON is an error,
  not automatically repaired or committed.

Managed versions are pinned to Codex 0.163.0, Claude Code 2.1.304 and Gemini CLI
0.64.0. Existing older clients are rejected because isolation flags may be missing.
Existing compatible PATH/global npm installations are reused; Codex desktop's
bundled Windows CLI is also detected. Newer clients can change behavior; updating
the pinned versions requires repeating the client compatibility checks.

## Privacy and practical limits

Ollama inference remains restricted to HTTP loopback, with redirects and proxies
disabled. Offline PDF extraction does not change. In account mode, learner answers,
prompts, history included by the feature, and selected source excerpts leave the
device and are processed under the chosen provider's rules. The original PDF file
and whole SQLite database are not uploaded by this bridge.

Official CLI clients may save their own configuration, telemetry or request logs.
Codex ephemeral sessions and Claude no-session-persistence reduce transcript
storage, but this is not a promise that the service or client keeps no records.
Gemini's own CLI history may persist. Signing out happens in the official client;
the application has no independent account token to revoke. The application never
automates browser authentication or reads another service's credentials.

Account access works in the Windows app. Browser preview shows a desktop-required
message and does not attempt OAuth or cloud requests. CLI installation and login
are user actions in Settings, not background startup tasks. Background connection
checks inspect installation/login only and do not spend inference quota.

Full end-to-end subscription inference requires a login for each service. Generic
protocol fixtures cannot establish an account's actual model entitlement. The
opt-in Rust test `real_codex_account_structured_smoke` sends a tiny arithmetic
request through the developer's existing ChatGPT login; normal tests never do.

## Official references

- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/)
- [Gemini CLI headless mode](https://geminicli.com/docs/cli/headless/)
- [Gemini CLI configuration](https://geminicli.com/docs/reference/configuration/)
- [Gemini CLI policy engine](https://geminicli.com/docs/reference/policy-engine/)

The upstream [ConceptLoom](https://github.com/Zproger/ConceptLoom) runs its coaching
workflow within coding clients. This desktop bridge follows that account-client
approach while retaining a native desktop learning interface.

## Validation on Windows

- 27 TypeScript unit tests passed; the two pre-existing optional SQLite checks
  remain skipped by the ordinary Vitest run on this Node configuration.
- 13 Rust tests passed, including saved consent enforcement, model/argument
  validation, tool restrictions, output limits, protocol errors and persistence.
- The opt-in native Codex test passed with a real saved ChatGPT account and a
  generic arithmetic request returning schema-validated JSON.
- All seven Playwright scenarios passed against the production frontend,
  including remembered providers/models, consent, PDF import, isolated source
  learning, evidence, progress and FSRS after reload.
- Published Claude Code 2.1.304 and Gemini CLI 0.64.0 accepted the actual isolated
  launch arguments and correctly required account login. No Claude/Gemini account
  was logged in during development; successful inference for those services is
  verified by the in-app Test response after the user signs in.
- Production dependency audit found no vulnerabilities. Windows release packaging
  is verified separately by the generated NSIS installer.
