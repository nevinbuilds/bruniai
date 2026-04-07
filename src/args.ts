interface Args {
  baseUrl?: string;
  prUrl?: string;
  pages?: string;
  bruniToken?: string;
  bruniApiUrl?: string;
}

/**
 * Parse command-line arguments from process.argv.
 *
 * @returns
 *  The parsed arguments.
 */
export function parseArgs(): Args {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg?.startsWith("--")) {
      const argName = arg.slice(2).replace(/-/g, "");
      // Check if next argument exists and is not another flag
      const value = process.argv[i + 1];
      if (value && !value.startsWith("--")) {
        args[argName] = value;
        i++; // Skip the value in next iteration
      }
    }
  }
  return {
    baseUrl: args.baseimagesource || args.baseurl,
    prUrl: args.previewurl || args.prurl,
    pages: args.pages,
    bruniToken: args.brunitoken,
    bruniApiUrl: args.bruniapiurl,
  };
}
