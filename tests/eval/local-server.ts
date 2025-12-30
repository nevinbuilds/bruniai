/**
 * Local HTTP server for serving test websites.
 *
 * Automatically starts a server when test cases use localhost URLs.
 */

import { createServer, Server } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { lookup } from "mime-types";

/**
 * Options for starting the local server.
 */
export interface LocalServerOptions {
  /** Port to run the server on. */
  port?: number;
  /** Directory to serve files from. */
  directory: string;
}

/**
 * Start a local HTTP server to serve test websites.
 */
export async function startLocalServer(
  options: LocalServerOptions
): Promise<Server> {
  const { port = 8000, directory } = options;

  const server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    // Remove query string and decode URL
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    // Try root directory first, then local-modified subdirectory
    let filePath = join(directory, urlPath);

    // If not found in root, try local-modified subdirectory
    if (!existsSync(filePath)) {
      const localModifiedPath = join(directory, "local-modified", urlPath);
      if (existsSync(localModifiedPath)) {
        filePath = localModifiedPath;
      }
    }

    // Security: prevent directory traversal
    const normalizedDir = directory.replace(/\\/g, "/");
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (!normalizedPath.startsWith(normalizedDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Check if it's a file (not directory)
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Read and serve the file
    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const mimeType = lookup(ext);
      const contentType = typeof mimeType === "string" ? mimeType : "text/html";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": content.length,
      });
      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          `Port ${port} is already in use. Assuming server is already running.`
        );
        // Create a dummy server object to represent existing server
        // The actual server will be handled by the existing process
        resolve(server);
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`Local server started on http://localhost:${port}`);
      console.log(`Serving files from: ${directory}`);
      resolve(server);
    });
  });
}

/**
 * Stop the local HTTP server.
 */
export async function stopLocalServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if server is actually listening
    if (!server.listening) {
      console.log("Local server was not running (port may have been in use)");
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log("Local server stopped");
        resolve();
      }
    });
  });
}

/**
 * Check if any test cases use localhost URLs.
 */
export function needsLocalServer(
  testCases: Array<{ baseUrl: string; previewUrl: string }>
): boolean {
  return testCases.some(
    (tc) =>
      tc.baseUrl.startsWith("http://localhost:") ||
      tc.previewUrl.startsWith("http://localhost:")
  );
}
