# Test Websites

This directory contains HTML test pages with controlled visual changes for evaluation purposes.

## Files

### Website 1 - Business Theme

- **website1-base.html**: Base business website with Header, Features, Services, and Footer sections
- **website1-missing-section.html**: Missing Features section (for missing section tests)
- **website1-h1-change.html**: Only the main h1 text changed (for content-only change tests)
- **website1-content-change.html**: Multiple content elements changed (paragraphs, lists) (for content-only change tests)
- **website1-banner.html**: Banner added at the top of the page (for banner tests)

### Website 2 - Blog Theme

- **website2-base.html**: Base blog website with Header, Featured Post, Recent Posts, and Footer sections
- **website2-missing-section.html**: Missing Recent Posts section (for missing section tests)
- **website2-h1-change.html**: Only the main h1 text changed (for content-only change tests)
- **website2-content-change.html**: Multiple content elements changed (for content-only change tests)
- **website2-banner.html**: Banner added at the top of the page (for banner tests)

## Usage

These HTML files are automatically served by the local server when running evaluation tests. The server starts automatically when test cases use localhost URLs.

For manual testing, you can serve them locally using a simple HTTP server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then access them at:

- http://localhost:8000/website1-base.html
- http://localhost:8000/website2-base.html
- etc.

## Test Scenarios

### Identical Tests

- Compare `website1-base.html` to itself - should show no differences (pass)
- Compare `website2-base.html` to itself - should show no differences (pass)

### Missing Sections Tests

- Compare `website1-base.html` to `website1-missing-section.html` - should detect missing Features section (fail)
- Compare `website2-base.html` to `website2-missing-section.html` - should detect missing Recent Posts section (fail)

### Content Only Changes Tests

- Compare `website1-base.html` to `website1-h1-change.html` - should pass (content-only change)
- Compare `website2-base.html` to `website2-h1-change.html` - should pass (content-only change)
- Compare `website1-base.html` to `website1-content-change.html` - should pass (content-only changes)
- Compare `website2-base.html` to `website2-content-change.html` - should pass (content-only changes)

### Banner Tests

- Compare `website1-base.html` to `website1-banner.html` - should detect banner and show warning
- Compare `website2-base.html` to `website2-banner.html` - should detect banner and show warning
