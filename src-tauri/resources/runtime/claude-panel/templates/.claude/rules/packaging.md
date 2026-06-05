# Packaging Rules

- Customer builds must not include local `.claude` history, project memory, local settings, or logs.
- Customer builds must not include real API keys, tokens, passwords, or private files.
- Package only safe templates, frontend resources, local service code, and required runtime files.
- Before packaging, run syntax checks and P0 security regression tests.
- The Windows green version should start by double-clicking the executable and should not require customers to open a terminal.

