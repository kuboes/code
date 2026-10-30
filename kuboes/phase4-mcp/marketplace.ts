// Original kuboes curated marketplace: local registry only, no network fetch.
// A bundle is a list of MCP server configs + plugin names; install validates
// and returns the config JSON the caller writes (no secret handling here).
export type McpServer = { name: string; command: string; args?: string[]; env?: Record<string, string> };
export type Bundle = { id: string; label: string; description: string; servers: McpServer[]; plugins: string[] };
export const BUNDLES: Bundle[] = [
  { id: "dev", label: "Development", description: "git + filesystem + shell helpers", servers: [{ name: "fs", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] }], plugins: ["git-helper"] },
  { id: "web", label: "Web", description: "fetch + search helpers", servers: [{ name: "fetch", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] }], plugins: ["web-search"] },
  { id: "mobile", label: "Mobile/Termux", description: "lightweight, no heavy deps", servers: [], plugins: ["termux-light"] },
  { id: "kuboes-own", label: "Kuboes own tools", description: "Placeholders for Saizeriya Worker / SNS search MCPs (configure URL in env, do not hardcode secrets)", servers: [{ name: "saizeriya", command: "npx", args: ["-y", "mcp-remote"], env: { URL: "${SAIZERIYA_MCP_URL}" } }], plugins: [] },
];
export function listBundles(): Bundle[] { return BUNDLES; }
export function installBundle(id: string): { mcpServers: Record<string, McpServer>; plugins: string[] } {
  const b = BUNDLES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown bundle: ${id}`);
  const mcpServers: Record<string, McpServer> = {};
  for (const s of b.servers) { if (!s.name || !s.command) throw new Error(`invalid server in ${id}`); mcpServers[s.name] = s; }
  return { mcpServers, plugins: b.plugins };
}
