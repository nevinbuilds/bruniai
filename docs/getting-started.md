# Getting Started

This guide will help you set up and start using the Visual Regression Testing tool locally. This is a TypeScript-based application that runs on Node.js.

## Prerequisites

- Node.js 20 or higher
- npm (comes with Node.js)
- Git
- OpenAI API key

## Installation Steps

1.  **Clone the Repository**

    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install Dependencies**

    ```bash
    npm install
    ```

3.  **Build TypeScript**

    ```bash
    npm run build
    ```

4.  **Install Playwright Browsers**

    ```bash
    npx playwright install --with-deps chromium
    ```

    **Note**: Playwright browsers are required because Stagehand uses Playwright under the hood for browser automation.
    The Vercel MCP app uses `@sparticuz/chromium` instead of bundling the full Playwright browser payload.

5.  **Set Up Environment Variables**
    Create a `.env` file in the root directory and add your OpenAI API key:

    ```
    OPENAI_API_KEY=your_api_key_here
    ```

    **Optional (for advanced features):**

    - `GITHUB_TOKEN` – for posting PR comments
    - `BRUNI_TOKEN` and `BRUNI_API_URL` – for Bruni API integration
    - `GITHUB_REPOSITORY` – repository identifier (e.g., `owner/repo`)
    - `PR_NUMBER` – pull request number (if not provided, will be inferred from GitHub event)

## Running the Visual Tests

1. **Run the Visual Regression Tests**

   You can run the tests using the built JavaScript:

   ```bash
   GITHUB_TOKEN=<github-token> node dist/index.js --base-url <production-url> --pr-url <pull-request-url> --pages '<pages>'
   ```

   Or run directly with TypeScript (for development):

   ```bash
   GITHUB_TOKEN=<github-token> npm run dev -- --base-url <production-url> --pr-url <pull-request-url> --pages '<pages>'
   ```

   The GitHub token is needed to write comments to the PR.

   **Note**: The pages parameter should be a comma-separated list of paths (e.g., `"/,/about,/contact"`).

## Understanding the Output

The tool will:

1. Capture screenshots of both the production and PR versions
2. Compare the images and highlight differences
3. Generate a report with the findings
4. Provide AI-powered analysis of the changes
5. Post a comment to the GitHub PR with the results

## Next Steps

- Review the [Configuration Guide](configuration.md) to customize the testing behavior
- Check out [Usage Examples](usage-examples.md) for more advanced scenarios
- Learn about the [Architecture](architecture-diagram.md) to understand how the tool works
