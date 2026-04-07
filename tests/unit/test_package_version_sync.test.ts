import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), relativePath), "utf-8"),
  ) as T;
}

describe("package version sync", () => {
  it("keeps the publishable packages and Vercel app pinned to the same Bruniai version", () => {
    const rootPkg = readJson<{ version: string }>("package.json");
    const bruniaiPkg = readJson<{ version: string }>(
      "packages/bruniai/package.json",
    );
    const mcpServerPkg = readJson<{
      version: string;
      dependencies: { bruniai: string };
    }>("packages/mcp-server/package.json");
    const mcpVercelAppPkg = readJson<{
      dependencies: {
        bruniai: string;
        "bruniai-mcp-server": string;
      };
    }>("apps/mcp-vercel/package.json");
    const lockfile = readJson<{
      version: string;
      packages: {
        "": { version: string };
        "packages/bruniai": { version: string };
        "packages/mcp-server": {
          version: string;
          dependencies: { bruniai: string };
        };
      };
    }>("package-lock.json");

    expect(bruniaiPkg.version).toBe(rootPkg.version);
    expect(mcpServerPkg.version).toBe(bruniaiPkg.version);
    expect(mcpServerPkg.dependencies.bruniai).toBe(bruniaiPkg.version);
    expect(mcpVercelAppPkg.dependencies.bruniai).toBe(bruniaiPkg.version);
    expect(mcpVercelAppPkg.dependencies["bruniai-mcp-server"]).toBe(
      bruniaiPkg.version,
    );
    expect(lockfile.version).toBe(bruniaiPkg.version);
    expect(lockfile.packages[""].version).toBe(bruniaiPkg.version);
    expect(lockfile.packages["packages/bruniai"].version).toBe(
      bruniaiPkg.version,
    );
    expect(lockfile.packages["packages/mcp-server"].version).toBe(
      bruniaiPkg.version,
    );
    expect(lockfile.packages["packages/mcp-server"].dependencies.bruniai).toBe(
      bruniaiPkg.version,
    );
  });
});
