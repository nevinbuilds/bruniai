# Section extraction eval

This folder contains an eval harness for section extraction: it runs the vision API on baseline images and compares extracted section names to an expected list.

## Requirements

- **OPENAI_API_KEY**: Set this in your environment or in a `.env` file at the project root. The eval tests load `.env` via `dotenv/config`; without the key, the eval tests are skipped so CI without the key still passes.
- Baseline images must exist at the paths defined in `section-eval-cases.ts` (e.g. `tests/images/design.jpg`, `tests/images/design-1.png`).

## Running the eval

From the project root:

```bash
# Run all tests (eval tests skip if OPENAI_API_KEY is not set)
npm run test

# Run only the section eval tests (uses OPENAI_API_KEY from .env or env)
npm run test -- tests/eval
```

## Adding new cases

Edit `section-eval-cases.ts` and append a new object to `sectionEvalCases`:

- **name**: Human label for the case.
- **baseImagePath**: Path to the baseline image relative to project root (e.g. `tests/images/your-image.png`).
- **previewUrl**: Reference URL for documentation; not used by the section-only eval.
- **expectedSections**: Array of expected section names in order (strings).

No code changes to the runner or matching logic are required.
