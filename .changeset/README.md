# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): each is a small
markdown file describing a change and which packages it bumps. Add one with
`pnpm changeset`. On merge to `main`, the release workflow opens/updates a "Version Packages"
PR; merging that PR publishes the bumped `@mcpfold/*` packages (and `mcpfold`) to npm.

Private/non-published packages (`@mcpfold/security`, and the future `apps/web` +
`services/edge`) are ignored — see `config.json`.
