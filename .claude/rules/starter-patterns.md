# Starter patterns - apply on touch

Apply these when already editing the relevant code. Never as a bulk refactor.

- Editing a file over 300 lines -> split per the file-size hook's suggestions
  (types / constants / validation / utils).
- Touching a `throw` / `raise` site -> route it through the error registry
  (`guides/error-id-registry.md`).
- Changing a fallible function's signature -> consider returning a Result
  (`guides/discriminated-union-results.md`).
- Touching an env read -> move it behind the env boundary
  (`guides/zod-at-the-boundary.md`).
- Adding a long-running operation -> thread cancellation through it
  (`guides/abort-signal-threading.md`).
- Adding a new tool -> use the directory-per-tool layout
  (`guides/tool-authoring-pattern.md`).
