import { existsSync } from "fs";
import { platform } from "os";
import { chromium, type LaunchOptions } from "playwright";
import { Stagehand } from "@browserbasehq/stagehand";

const COMMON_BROWSER_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
  ],
};

function firstExistingPath(paths: Array<string | undefined>): string | undefined {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolvePlaywrightExecutablePath(): string | undefined {
  try {
    const executablePath = chromium.executablePath();
    if (executablePath && existsSync(executablePath)) {
      return executablePath;
    }
  } catch {
    // Fall through to system browser lookup.
  }

  return undefined;
}

function resolveChromiumExecutablePath(): string | undefined {
  const envPath = firstExistingPath([
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ]);

  if (envPath) {
    return envPath;
  }

  const playwrightPath = resolvePlaywrightExecutablePath();
  if (playwrightPath) {
    return playwrightPath;
  }

  return firstExistingPath(COMMON_BROWSER_PATHS[platform()] || []);
}

function getLocalBrowserLaunchOptions(): LaunchOptions {
  const executablePath = resolveChromiumExecutablePath();

  if (!executablePath) {
    throw new Error(
      "Unable to find a Chromium/Chrome executable. Set CHROME_PATH or install Playwright Chromium with `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`.",
    );
  }

  return {
    headless: true,
    executablePath,
  };
}

export function createLocalStagehand(): Stagehand {
  return new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: getLocalBrowserLaunchOptions(),
  });
}
