#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Colors for console output.
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warn(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Execute a command and return output.
function exec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
    });
  } catch (err) {
    error(`Command failed: ${command}`);
  }
}

// Get git status.
function getGitStatus() {
  try {
    return execSync("git status --porcelain", {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

// Read package.json.
function readPackageJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Write package.json.
function writePackageJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

// Keep the workspace package-lock metadata aligned with manifest versions.
function syncWorkspaceLockfile(path, newVersion) {
  const lockfile = readPackageJson(path);

  lockfile.version = newVersion;
  if (lockfile.packages?.[""]) {
    lockfile.packages[""].version = newVersion;
  }
  if (lockfile.packages?.["packages/bruniai"]) {
    lockfile.packages["packages/bruniai"].version = newVersion;
  }
  if (lockfile.packages?.["packages/mcp-server"]) {
    lockfile.packages["packages/mcp-server"].version = newVersion;
    if (lockfile.packages["packages/mcp-server"].dependencies) {
      lockfile.packages["packages/mcp-server"].dependencies.bruniai =
        newVersion;
    }
  }

  writePackageJson(path, lockfile);
}

// Bump version.
function bumpVersion(version, type = "patch") {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

// Main deployment function.
async function deploy() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipBuild = args.includes("--skip-build");
  const skipTests = args.includes("--skip-tests");
  const versionType =
    args.find((arg) => ["major", "minor", "patch"].includes(arg)) || "patch";
  const customVersion = args
    .find((arg) => arg.startsWith("--version="))
    ?.split("=")[1];

  log("\n🚀 Starting deployment process...\n", colors.cyan);

  // Check git status.
  const gitStatus = getGitStatus();
  if (gitStatus && !dryRun) {
    warn("Working directory has uncommitted changes.");
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question("Continue anyway? (y/N): ", resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "y") {
      error("Deployment cancelled.");
    }
  }

  // Read package.json files.
  const rootPkg = readPackageJson(join(rootDir, "package.json"));
  const bruniaiPkg = readPackageJson(
    join(rootDir, "packages/bruniai/package.json")
  );
  const mcpServerPkg = readPackageJson(
    join(rootDir, "packages/mcp-server/package.json")
  );
  const mcpVercelAppPkg = readPackageJson(
    join(rootDir, "apps/mcp-vercel/package.json")
  );

  // Determine new version.
  const currentVersion = bruniaiPkg.version;
  const newVersion = customVersion || bumpVersion(currentVersion, versionType);

  info(`Current version: ${currentVersion}`);
  info(`New version: ${newVersion}`);

  if (dryRun) {
    log("\n🔍 DRY RUN MODE - No changes will be made\n", colors.yellow);
  }

  // Run tests.
  if (!skipTests && !dryRun) {
    info("Running tests...");
    exec("npm test");
    success("Tests passed!");
  } else if (!skipTests) {
    info("Skipping tests (dry-run mode)");
  }

  // Build packages.
  if (!skipBuild) {
    info("Building packages...");
    exec("npm run build");
    success("Build completed!");
  } else {
    warn("Skipping build (--skip-build flag)");
  }

  // Update versions.
  info("Updating package versions...");

  bruniaiPkg.version = newVersion;
  writePackageJson(join(rootDir, "packages/bruniai/package.json"), bruniaiPkg);

  mcpServerPkg.version = newVersion;
  mcpServerPkg.dependencies.bruniai = newVersion;
  writePackageJson(
    join(rootDir, "packages/mcp-server/package.json"),
    mcpServerPkg
  );

  mcpVercelAppPkg.dependencies.bruniai = newVersion;
  mcpVercelAppPkg.dependencies["bruniai-mcp-server"] = newVersion;
  writePackageJson(
    join(rootDir, "apps/mcp-vercel/package.json"),
    mcpVercelAppPkg
  );

  syncWorkspaceLockfile(join(rootDir, "package-lock.json"), newVersion);

  rootPkg.version = newVersion;
  writePackageJson(join(rootDir, "package.json"), rootPkg);

  success("Versions updated!");

  if (dryRun) {
    log("\n🔍 Dry run complete. No packages were published.\n", colors.yellow);
    return;
  }

  // Publish bruniai package first.
  info("Publishing bruniai package...");
  exec("npm publish --workspace=packages/bruniai --access public");
  success("bruniai published!");

  // Wait a moment for npm registry to update.
  info("Waiting for npm registry to update...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Publish mcp-server package.
  info("Publishing bruniai-mcp-server package...");
  exec("npm publish --workspace=packages/mcp-server --access public");
  success("bruniai-mcp-server published!");

  // Create git tag.
  info("Creating git tag...");
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  success(`Tag v${newVersion} created!`);

  // Commit version changes.
  info("Committing version changes...");
  exec(
    "git add packages/bruniai/package.json packages/mcp-server/package.json apps/mcp-vercel/package.json package.json package-lock.json"
  );
  exec(`git commit -m "chore: bump version to ${newVersion}"`);
  success("Version changes committed!");

  log("\n✨ Deployment completed successfully!\n", colors.green);
  info("Next steps:");
  info(`  1. Review the changes: git log -1`);
  info(
    `  2. Push changes: git push origin ${execSync(
      "git branch --show-current",
      { encoding: "utf-8" }
    ).trim()}`
  );
  info(`  3. Push tags: git push origin v${newVersion}`);
}

// Run deployment.
deploy().catch((err) => {
  error(`Deployment failed: ${err.message}`);
  process.exit(1);
});
