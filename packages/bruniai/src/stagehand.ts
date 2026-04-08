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

interface ServerlessChromiumModule {
  args?: string[];
  executablePath?: () => Promise<string>;
  default?: ServerlessChromiumImplementation;
}

interface ServerlessChromiumImplementation {
  args?: string[];
  executablePath?: () => Promise<string>;
}

function extractServerlessChromium(
  module: ServerlessChromiumModule,
): ServerlessChromiumImplementation {
  return module.default ?? module;
}

async function resolveServerlessChromiumLaunchOptions(): Promise<LaunchOptions | null> {
  if (!process.env.VERCEL) {
    return null;
  }

  try {
    const chromiumModule = extractServerlessChromium(
      (await import("@sparticuz/chromium")) as ServerlessChromiumModule,
    );
    const executablePath = await chromiumModule.executablePath?.();
    if (!executablePath) {
      return null;
    }

    return {
      headless: true,
      executablePath,
      args: chromiumModule.args,
    };
  } catch {
    return null;
  }
}

export function resolveChromiumExecutablePath(): string | undefined {
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

async function getLocalBrowserLaunchOptions(): Promise<LaunchOptions> {
  const serverlessOptions = await resolveServerlessChromiumLaunchOptions();
  if (serverlessOptions) {
    return serverlessOptions;
  }

  const executablePath = resolveChromiumExecutablePath();

  if (!executablePath) {
    throw new Error(
      "Unable to find a Chromium/Chrome executable. Set CHROME_PATH, install Playwright Chromium locally, or provide @sparticuz/chromium in serverless environments.",
    );
  }

  return {
    headless: true,
    executablePath,
  };
}

export async function createLocalStagehand(): Promise<Stagehand> {
  return new Stagehand({
    env: "LOCAL",
    disablePino: true,
    localBrowserLaunchOptions: await getLocalBrowserLaunchOptions(),
  });
}
