# Visual Comparison Evaluation Framework

This directory contains an automated evaluation framework for testing the visual comparison tool against diverse websites to measure accuracy, specifically focusing on false positives and false negatives.

## Overview

The evaluation framework tests the visual comparison tool (`performComparison`) across three scenarios:

1. **Identical Pages**: Same URL compared to itself - should show no differences
2. **Known Differences**: Pages with intentional visual changes - should detect differences
3. **Edge Cases**: Pages with dynamic content, animations, etc. - should handle gracefully

## Quick Start

Run the evaluation:

```bash
npm run eval
```

This will:

1. Execute all active test cases
2. Collect results and calculate metrics
3. Generate reports (Markdown and JSON) in a temporary directory

## Structure

- **`test-cases.ts`**: Test case definitions with expected outcomes
- **`eval-runner.ts`**: Executes comparisons and collects results
- **`metrics.ts`**: Calculates false positives, false negatives, and accuracy
- **`report.ts`**: Generates evaluation reports with statistics
- **`run-eval.ts`**: Main evaluation script
- **`test-websites/`**: HTML test pages with controlled visual changes

## Test Cases

Test cases are defined in `test-cases.ts`. Each test case includes:

- `id`: Unique identifier
- `name`: Descriptive name
- `baseUrl`: Base/reference URL
- `previewUrl`: Preview/changed URL
- `expectedStatus`: Expected status ("pass", "fail", "warning", "none")
- `expectedDifference`: Whether differences should be detected
- `category`: Test category ("identical", "known_diff", "edge_case")
- `description`: What this test validates
- `skip`: Optional flag to skip the test

### Adding Test Cases

To add a new test case, edit `test-cases.ts`:

```typescript
{
  id: "my-test-case",
  name: "My Test Case",
  baseUrl: "https://example.com",
  previewUrl: "https://example.com",
  expectedStatus: "pass",
  expectedDifference: false,
  category: "identical",
  description: "Tests that identical pages show no differences",
}
```

## Test Websites

The `test-websites/` directory contains HTML pages with controlled changes:

### Simple Test Pages

- **`identical.html`**: Baseline page
- **`color-change.html`**: Same structure, different colors
- **`missing-section.html`**: Missing a section compared to baseline
- **`layout-change.html`**: Different layout
- **`dynamic-content.html`**: Contains timestamps and random content

### Local Modified Versions of Real Websites

The `test-websites/local-modified/` directory contains modified versions of real websites (GitHub, Wikipedia, etc.) that can be compared against their live counterparts. These provide more realistic test cases:

- **`github-color-change.html`**: GitHub homepage with header color changed
- **`github-missing-section.html`**: GitHub homepage with navigation section removed
- **`wikipedia-layout-change.html`**: Wikipedia homepage with layout changed to single column
- **`wikipedia-text-change.html`**: Wikipedia homepage with modified text content

These allow you to:

- Compare live websites (`https://github.com`) with local modified versions (`http://localhost:8000/github-color-change.html`)
- Pinpoint specific intentional differences
- Test against real-world website structures

### Using Test Websites

To use the test websites, serve them locally:

```bash
# Using Python
cd tests/eval/test-websites
python3 -m http.server 8000

# Or serve the local-modified directory specifically
cd tests/eval/test-websites/local-modified
python3 -m http.server 8000

# Using Node.js (http-server)
cd tests/eval/test-websites
npx http-server -p 8000
```

Then update test cases to use:

- Simple pages: `http://localhost:8000/identical.html`
- Local modified versions: `http://localhost:8000/github-color-change.html`

**Note**: Test cases using local-modified versions are skipped by default (`skip: true`). To enable them:

1. Start a local server serving the `local-modified/` directory
2. Remove `skip: true` from the test cases in `test-cases.ts`
3. Run the evaluation

## Metrics

The evaluation calculates the following metrics:

- **False Positive Rate**: Percentage of identical pages incorrectly flagged as different
- **False Negative Rate**: Percentage of different pages incorrectly flagged as identical
- **Accuracy**: Overall correctness percentage
- **Per-Category Metrics**: Breakdown by test category

## Reports

Two types of reports are generated:

1. **Markdown Report** (`eval-report.md`): Human-readable report with:

   - Overall summary
   - Metrics by category
   - Detailed results table
   - Failed tests details
   - Error details
   - Recommendations

2. **JSON Report** (`eval-report.json`): Machine-readable report with:
   - All metrics
   - Complete test results
   - Timestamp

Reports are saved in a temporary directory (path shown in console output).

## Configuration

### Environment Variables

The evaluation uses the same environment variables as the main tool:

- `OPENAI_API_KEY`: Required for visual analysis (if not set, tests may fail)

### Timeout

Default timeout per test case is 60 seconds. This can be adjusted in `run-eval.ts`:

```typescript
timeout: 60000, // milliseconds
```

## Interpreting Results

### Good Results

- False Positive Rate < 10%
- False Negative Rate < 10%
- Accuracy > 90%
- No errors

### Issues to Watch For

- **High False Positive Rate**: Tool is too sensitive, flagging identical pages as different
- **High False Negative Rate**: Tool is missing actual visual differences
- **Errors**: Test cases failing due to timeouts or other errors

## Continuous Integration

The evaluation can be integrated into CI/CD pipelines:

```yaml
# .github/workflows/eval.yml
name: Evaluation
on:
  schedule:
    - cron: "0 0 * * 0" # Weekly
  workflow_dispatch:

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run eval
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: eval-reports
          path: /tmp/bruniai-eval-report-*/
```

## Troubleshooting

### Tests Timing Out

- Increase timeout in `run-eval.ts`
- Check network connectivity
- Verify URLs are accessible

### High False Positive Rate

- Review test cases - some public websites may have dynamic content
- Consider using controlled test websites instead
- Adjust sensitivity thresholds in the visual analysis

### High False Negative Rate

- Verify test cases have actual differences
- Check that differences are visually significant
- Review visual analysis prompts

## Contributing

When adding new test cases:

1. Add test case to `test-cases.ts`
2. If using controlled test websites, add HTML files to `test-websites/`
3. Run evaluation: `npm run eval`
4. Review metrics and adjust expectations if needed
5. Update documentation if adding new categories or features
