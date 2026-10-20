# @epi/ui

Reusable React controls and data display components. `index.ts` is the public export barrel; component implementations are separate files in `src/`.

The package uses Tailwind utility classes and MUI icons. A consuming app should scan the package sources in its Tailwind `content` config and provide the color variables used by its theme (`--color-primary`, `--color-danger`, and related colors). Install React and `@mui/icons-material` as peer dependencies.

Components that display product-specific copy accept labels or text props. The EPI app wraps a few of them to pass its own translations.
