import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = join(__dirname, "..");
const repoRoot = join(packageDir, "..", "..");
const rootDistDir = join(repoRoot, "dist");
const packageRuntimeDir = join(packageDir, "dist", "runtime");

const runtimeEntries = [
  "comparison",
  "diff",
  "image",
  "reporter",
  "sections",
  "utils",
  "vision",
];

if (!existsSync(rootDistDir)) {
  throw new Error(`Root build output not found at ${rootDistDir}`);
}

rmSync(packageRuntimeDir, { recursive: true, force: true });
mkdirSync(packageRuntimeDir, { recursive: true });

for (const entry of runtimeEntries) {
  const sourcePath = join(rootDistDir, entry);
  const targetPath = join(packageRuntimeDir, entry);

  if (!existsSync(sourcePath)) {
    throw new Error(`Expected runtime entry not found at ${sourcePath}`);
  }

  cpSync(sourcePath, targetPath, { recursive: true });
}
