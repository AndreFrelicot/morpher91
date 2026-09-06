## Summary

<!-- What changes, and why? Keep one logical purpose per pull request. -->

## Verification

- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm exec eslint . --max-warnings=0`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manual browser/GPU check documented when rendering changes

## Release checks

- [ ] Commits are atomic by fix/feature
- [ ] All 16 locale catalogues and plural keys are synchronized
- [ ] Contextual-assistant guides and `data-assist` anchors are synchronized
- [ ] Preview/export parity is preserved
- [ ] GPU/media resources are disposed correctly
- [ ] User-visible rendering changes include screenshots
- [ ] No secret, local file, generated build, or unlicensed media was added
