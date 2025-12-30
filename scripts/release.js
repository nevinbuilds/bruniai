#!/usr/bin/env node

import "dotenv/config";
import { execSync } from "child_process";
import { readFileSync } from "fs";
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

// Execute a command and return output as string.
function execOutput(command, options = {}) {
  try {
    return execSync(command, {
      cwd: rootDir,
      encoding: "utf-8",
      ...options,
    }).trim();
  } catch (err) {
    error(`Command failed: ${command}`);
  }
}

// Get git status.
function getGitStatus() {
  try {
    return execOutput("git status --porcelain");
  } catch {
    return "";
  }
}

// Get current git branch.
function getCurrentBranch() {
  return execOutput("git branch --show-current");
}

// Get git remote URL and extract owner/repo.
function getGitHubRepo() {
  try {
    const remoteUrl = execOutput("git remote get-url origin");
    // Handle both SSH and HTTPS URLs.
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/) ||
      remoteUrl.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
    error("Could not determine GitHub repository from remote URL");
  } catch (err) {
    error("Could not get git remote URL");
  }
}

// Read package.json.
function readPackageJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Get latest tag version.
function getLatestTagVersion() {
  try {
    const latestTag = execOutput(
      "git tag --sort=-version:refname | head -1 || echo ''"
    );
    if (!latestTag) {
      return null;
    }
    // Remove 'v' prefix if present.
    return latestTag.replace(/^v/, "");
  } catch {
    return null;
  }
}

// Get commits since last tag.
function getCommitsSinceLastTag() {
  try {
    const lastTag = execOutput(
      "git describe --tags --abbrev=0 2>/dev/null || echo ''"
    );
    if (!lastTag) {
      return execOutput("git log --pretty=format:'- %s' --no-merges");
    }
    return execOutput(
      `git log ${lastTag}..HEAD --pretty=format:'- %s' --no-merges`
    );
  } catch {
    return "";
  }
}

// Create GitHub release via API.
async function createGitHubRelease(
  token,
  owner,
  repo,
  tag,
  version,
  releaseNotes
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  const body = {
    tag_name: tag,
    name: `Release ${tag}`,
    body: releaseNotes || `Release ${tag}`,
    draft: false,
    prerelease: false,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`Failed to create GitHub release: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    error(`Error creating GitHub release: ${err.message}`);
  }
}

// Main release function.
async function release() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const customVersion = args
    .find((arg) => arg.startsWith("--version="))
    ?.split("=")[1];

  log("\n🚀 Starting release process...\n", colors.cyan);

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
      error("Release cancelled.");
    }
  }

  // Check for GitHub token.
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken && !dryRun) {
    error(
      "GITHUB_TOKEN environment variable is required. " +
        "Set it with: export GITHUB_TOKEN=your_token"
    );
  }

  // Read package.json to get version.
  const bruniaiPkg = readPackageJson(
    join(rootDir, "packages/bruniai/package.json")
  );

  // Get latest tag version.
  const latestTagVersion = getLatestTagVersion();
  if (latestTagVersion) {
    info(`Latest tag version: v${latestTagVersion}`);
  }

  // Determine version.
  let version = customVersion || bruniaiPkg.version;
  if (!version) {
    error("Could not determine version. Specify with --version=x.y.z");
  }

  // Validate version format.
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    error(`Invalid version format: ${version}. Expected format: x.y.z`);
  }

  // Warn if package.json version is behind latest tag.
  if (latestTagVersion && !customVersion) {
    const pkgVersionParts = version.split(".").map(Number);
    const latestParts = latestTagVersion.split(".").map(Number);
    const isBehind =
      latestParts[0] > pkgVersionParts[0] ||
      (latestParts[0] === pkgVersionParts[0] &&
        latestParts[1] > pkgVersionParts[1]) ||
      (latestParts[0] === pkgVersionParts[0] &&
        latestParts[1] === pkgVersionParts[1] &&
        latestParts[2] > pkgVersionParts[2]);

    if (isBehind) {
      warn(
        `Package.json version (${version}) is behind latest tag (v${latestTagVersion})`
      );
      warn(`Consider using: --version=${latestTagVersion}`);
    }
  }

  const tag = `v${version}`;
  const movingTag = "v1";

  info(`Version: ${version}`);
  info(`Tag: ${tag}`);
  info(`Moving tag: ${movingTag}`);

  if (dryRun) {
    log("\n🔍 DRY RUN MODE - No changes will be made\n", colors.yellow);
  }

  // Get current commit SHA.
  const currentSha = execOutput("git rev-parse HEAD");
  info(`Current commit: ${currentSha.substring(0, 7)}`);

  // Check if tag already exists.
  const existingTagSha = execOutput(
    `git rev-parse ${tag} 2>/dev/null || echo ''`
  );
  if (existingTagSha && !dryRun) {
    const existingTagCommit = existingTagSha.substring(0, 7);
    warn(`Tag ${tag} already exists at commit ${existingTagCommit}`);
    warn(`Current commit is ${currentSha.substring(0, 7)}`);

    if (existingTagSha === currentSha) {
      warn("Tag already points to current commit. Will update moving tag.");
    } else if (force) {
      // Delete existing tag locally and remotely.
      info(`Deleting existing tag ${tag} (--force flag)...`);
      exec(`git tag -d ${tag} 2>/dev/null || true`);
      exec(`git push origin :refs/tags/${tag} 2>/dev/null || true`);
      success(`Deleted existing tag ${tag}`);
    } else {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise((resolve) => {
        rl.question(
          "Delete and recreate tag? (y/N) or use --force flag: ",
          resolve
        );
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        error("Release cancelled. Use --force to overwrite existing tags.");
      }

      // Delete existing tag locally and remotely.
      info(`Deleting existing tag ${tag}...`);
      exec(`git tag -d ${tag} 2>/dev/null || true`);
      exec(`git push origin :refs/tags/${tag} 2>/dev/null || true`);
      success(`Deleted existing tag ${tag}`);
    }
  } else if (existingTagSha && dryRun) {
    warn(`Tag ${tag} already exists (dry-run mode)`);
  }

  // Get GitHub repository info.
  const repo = getGitHubRepo();
  const [owner, repoName] = repo.split("/");
  info(`Repository: ${repo}`);

  // Generate release notes.
  const commits = getCommitsSinceLastTag();
  const lastTag = execOutput(
    "git describe --tags --abbrev=0 2>/dev/null || echo ''"
  );
  let releaseNotes = `Release ${tag}`;

  if (commits) {
    const changelogLink = lastTag
      ? `https://github.com/${repo}/compare/${lastTag}...${tag}`
      : `https://github.com/${repo}/commits/${tag}`;
    releaseNotes = `## Changes\n\n${commits}\n\n---\n\n*Full Changelog*: ${changelogLink}`;
  }

  if (dryRun) {
    log("\n📝 Release notes preview:", colors.cyan);
    log(releaseNotes);
    log(
      "\n🔍 Dry run complete. No tags or releases were created.\n",
      colors.yellow
    );
    return;
  }

  // Create versioned tag.
  info("Creating versioned tag...");
  exec(`git tag -a ${tag} -m "Release ${tag}"`);
  success(`Tag ${tag} created!`);

  // Create or update moving v1 tag.
  info("Creating/updating moving v1 tag...");
  try {
    exec(`git tag -d ${movingTag} 2>/dev/null || true`);
  } catch {
    // Tag might not exist locally, which is fine.
  }
  exec(`git tag -a ${movingTag} -m "Release ${tag} (moving tag)"`);
  success(`Moving tag ${movingTag} created/updated!`);

  // Push tags to GitHub.
  info("Pushing tags to GitHub...");
  exec(`git push origin ${tag}`);
  exec(`git push origin ${movingTag} --force`);
  success("Tags pushed to GitHub!");

  // Create GitHub release.
  info("Creating GitHub release...");
  await createGitHubRelease(
    githubToken,
    owner,
    repoName,
    tag,
    version,
    releaseNotes
  );
  success("GitHub release created!");

  log("\n✨ Release completed successfully!\n", colors.green);
  info(`Release: https://github.com/${repo}/releases/tag/${tag}`);
  info(`Action usage: nevinbuilds/bruniai-action@${movingTag}`);
}

// Run release.
release().catch((err) => {
  error(`Release failed: ${err.message}`);
  process.exit(1);
});
