# Personal Overlay Template

Personal overlays hold machine/user-specific choices:

- provider env var names and provider group defaults
- non-secret local runtime env overrides such as proxy ports
- default model preference
- private memory
- local paths

Do not commit real API keys, tokens, cookies, or local credentials. Use env-var references such as `${EXAMPLE_API_KEY}`.
