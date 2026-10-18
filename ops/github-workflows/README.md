# Workflows to install

The bot's GitHub token has no `workflow` scope, so it cannot write to
`.github/workflows/`. Move these two files into place by hand (or from a
session whose token has that scope):

- `deploy.yml` → `.github/workflows/deploy.yml` (new): validate → D1 sync → R2 sync → build + `wrangler deploy` → purge cache. It does nothing until the repo variable `D1_DEPLOY_ENABLED` is `true`.
- `validate.yml` → `.github/workflows/validate.yml` (replaces it): seeds a local D1 before the browser suite, since search and detail pages now come from D1. **Until it is in place, the existing PR check will fail at the browser step**, because `npm run preview` is now `wrangler dev`.
