export default function Home() {
  return (
    <main
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "3rem 1.5rem",
        maxWidth: "52rem",
        margin: "0 auto",
      }}
    >
      <h1>BruniAI MCP</h1>
      <p>
        Private MCP endpoint for BruniAI visual comparison tools.
      </p>
      <p>
        MCP endpoint: <code>/mcp</code>
      </p>
      <p>
        Health check: <code>/healthz</code>
      </p>
    </main>
  );
}
