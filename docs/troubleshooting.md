# Troubleshooting Guide

This guide helps you resolve common issues that may arise while using the Visual Regression Testing tool.

## Common Issues and Solutions

### 1. Installation Problems

#### Issue: Node.js Version

**Symptoms:**

- Build errors
- Runtime errors related to Node.js features

**Solutions:**

1. Ensure Node.js 20 or higher is installed:
   ```bash
   node --version
   ```
2. If using nvm, switch to Node.js 20:
   ```bash
   nvm install 20
   nvm use 20
   ```
3. Update npm if needed:
   ```bash
   npm install -g npm@latest
   ```

#### Issue: TypeScript Build Errors

**Symptoms:**

- Type errors during build
- Module resolution errors

**Solutions:**

1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
2. Rebuild TypeScript:
   ```bash
   npm run build
   ```
3. Check TypeScript version compatibility:
   ```bash
   npx tsc --version
   ```

#### Issue: Playwright Browser Installation

**Symptoms:**

- Playwright browser installation failures
- Browser not found errors
- Stagehand unable to launch browser

**Solutions:**

1. Install Playwright browsers (required by Stagehand):
   ```bash
   npx playwright install --with-deps chromium
   ```
2. If on Linux, ensure system dependencies are installed:
   ```bash
   npx playwright install-deps chromium
   ```
3. If you already have a system Chrome/Chromium binary, you can also point Bruni at it with:
   ```bash
   export CHROME_PATH=/absolute/path/to/chrome
   ```
4. Note: The app uses Stagehand for browser automation, which requires a resolvable Chromium/Chrome executable. The Vercel MCP app uses `@sparticuz/chromium` instead of bundling Playwright's browser binaries.

### 2. Runtime Issues

#### Issue: Module Not Found Errors

**Symptoms:**

- `Cannot find module` errors
- Import errors

**Solutions:**

1. Ensure the project is built:
   ```bash
   npm run build
   ```
2. Check that you're running from the correct directory
3. Verify dist/ directory exists and contains compiled files

#### Issue: Environment Variables Not Loaded

**Symptoms:**

- Missing API key errors
- Configuration not found

**Solutions:**

1. Ensure `.env` file exists in the root directory
2. Check that `.env` contains required variables:
   ```
   OPENAI_API_KEY=your_key_here
   GITHUB_TOKEN=your_token_here
   ```
3. Verify environment variables are set when running:
   ```bash
   echo $OPENAI_API_KEY
   ```

#### Issue: GitHub PR Comments Not Posting

**Symptoms:**

- Missing PR comments
- Authentication errors

**Solutions:**

1. Verify `GITHUB_TOKEN` is set correctly
2. Check token has `pull-requests: write` permission
3. Ensure `GITHUB_REPOSITORY` environment variable is set (format: `owner/repo`)
4. Verify PR number is accessible (check `PR_NUMBER` env var or GitHub event)

## Debugging Tips

1. **Check Logs**

   - Review console output
   - Check error messages
   - Look for stack traces
   - Enable verbose logging if available

2. **Verify Environment**
   ```bash
   node --version  # Should be 20 or higher
   npm --version
   npx tsc --version  # Check TypeScript version
   ```

3. **Run in Development Mode**

   For more detailed error messages, run with TypeScript directly:
   ```bash
   npm run dev -- --base-url <url> --pr-url <url>
   ```

4. **Check Build Output**

   Ensure the TypeScript build completed successfully:
   ```bash
   npm run build
   ls -la dist/
   ```

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [Configuration Guide](configuration.md)
2. Review the [Usage Examples](usage-examples.md)
3. Consult the project's issue tracker
4. Contact the maintainers

Remember to provide:

- Error messages
- Environment details
- Steps to reproduce
- Expected vs actual behavior
