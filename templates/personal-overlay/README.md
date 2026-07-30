# Personal Overlay Template

Personal overlays hold machine/user-specific choices:

- temporary provider and task choices
- non-secret local runtime env overrides such as proxy ports
- default model preference
- private memory
- local paths

Do not commit real API keys, tokens, cookies, or local credentials. Use env-var references such as `${EXAMPLE_API_KEY}`.

Copy `env.local.example.yaml` to `config/local/env.yaml` and adjust the non-secret proxy values for the current machine. `config/local/` is ignored by Git.
