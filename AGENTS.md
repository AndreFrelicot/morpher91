# Repository guidance

- Application source and commands live in `app/`; read README.md and CONTRIBUTING.md first.
- Never commit or push unless explicitly requested by the user.
- Keep changes focused; preserve preview/export parity and resource disposal.
- All changed UI text must be translated in every catalogue under `app/src/i18n/locales/`.
- Keep contextual guides and `data-assist` anchors in sync with UI and behavior changes.
- Preserve media and font provenance and third-party license notices.
- Run checks appropriate to the change; do not claim real GPU or iPad validation from unit tests.
