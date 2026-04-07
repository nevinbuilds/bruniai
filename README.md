# 🎨 AI Visual Regression Testing

[![codecov](https://codecov.io/gh/nevinbuilds/bruniai-action/graph/badge.svg?token=83PQIAM92U)](https://codecov.io/gh/nevinbuilds/bruniai-action)

This GitHub Action automates visual regression testing by comparing screenshots and highlighting differences between production and pull request versions. It's perfect for CI/CD pipelines, helping teams catch unintended visual changes in web applications, design systems, and UI-driven projects.

## 🚀 Quick Start

Add this to your existing workflow file or or create a workflow file like this if you don't have one (e.g. `.github/workflows/visual-regression.yml`):

```yaml
name: Visual Regression Test
on:
  pull_request:
    branches: [main]

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Visual Regression Test
        uses: nevinbuilds/bruniai-action@v1.11
        with:
          # Your production URL.
          base-url: "https://www.example.com/"
          # Update to your preview URL format.
          pr-url: "https://example-git-${{ steps.branch-name.outputs.branch_name }}-{{github.actor}}.vercel.app"
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Multi-Page Testing

To test multiple pages, add the `pages` parameter:

```yaml
name: Visual Regression Test
on:
  pull_request:
    branches: [main]

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Visual Regression Test
        uses: nevinbuilds/bruniai-action@v1.11
        with:
          base-url: "https://www.example.com/"
          pr-url: "https://example-git-${{ github.head_ref }}-myusername.vercel.app"
          pages: '["/", "/about", "/contact", "/pricing"]'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Saving artifacts

If you want to save artifacts in your github workflow add the following to the previous snippet :

```
- name: Upload images as artifacts
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: visual-diff-images
    path: images
    retention-days: 1
```

## 📋 Requirements

- 📦 GitHub repository
- 🔑 OpenAI API key (set as `OPENAI_API_KEY` secret in your repository in `/settings/secrets/actions`)
- 🔐 GitHub token with the following permissions to the repository:

  - Read access to code, deployments, and metadata
  - Read and Write access to commit statuses and pull requests

The Github token is automatically provided by the GitHub Action when installing the [bruniai](https://github.com/apps/bruniai) app in your repository.

If you don't want to install the app you can provide the token as a env variable in your workflow similar to how you pass the openai key :

```
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This will ensure that the action can create comments in your PR, read the title and description from the PR and other related things that need access to the repository.

### 🔍 Preview URL format

The preview URL format depends on your deployment platform. Here are the common formats:

#### 🌐 Vercel Preview URLs

Vercel automatically creates preview deployments for pull requests. The URL format is:

```
https://[project-name]-git-[branch-name]-[username].vercel.app
```

Example:

```yaml
pr-url: "https://myapp-git-${{ github.head_ref }}-myusername.vercel.app"
```

#### 🏗️ Netlify Preview URLs

Netlify creates preview deployments with the following format:

```
https://deploy-preview-[PR-number]--[site-name].netlify.app
```

Example:

```yaml
pr-url: "https://deploy-preview-${{ github.event.pull_request.number }}--myapp.netlify.app"
```

#### 🔎 Finding Your Preview URL Format

1. **For Vercel**:

   - Go to your Vercel dashboard
   - Click on your project
   - Look at the preview deployment URLs for recent PRs
   - The format will be consistent across all preview deployments

2. **For Netlify**:
   - Go to your Netlify dashboard
   - Click on your site
   - Look at the "Deploy previews" section
   - The URL format will follow the pattern shown above

#### 🌍 Custom Domains

If you're using custom domains, replace the platform-specific domain with your custom domain while keeping the preview-specific parts of the URL.

## ✨ Features

- 📸 Automated screenshot comparison
- 🤖 AI-powered analysis of visual changes
- 🔄 GitHub PR integration
- 📊 Detailed reporting
- ⚡ Easy CI/CD integration

## 📚 Documentation

- [Getting Started](docs/getting-started.md) - Local development setup
- [Configuration Guide](docs/configuration.md) - Configuration options
- [Usage Examples](docs/usage-examples.md) - Common use cases
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Contributing](docs/contributing.md) - How to contribute
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines

## 📄 License

See [LICENSE](LICENSE) for details.

## Testing

See [tests/README.md](tests/README.md) for setup and usage.

To run all tests:

```bash
pytest
```

To check coverage:

```bash
pytest --cov=src --cov-report=term-missing
```

To generate an HTML coverage report:

```bash
pytest --cov=src --cov-report=html
open htmlcov/index.html
```
