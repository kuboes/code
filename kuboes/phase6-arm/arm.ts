// Original kuboes ARM/Termux setup helpers: pure functions, no downloads here.
export type ArchInfo = { platform: string; arch: string; isTermux: boolean; bunAsset: string; ripgrepAsset: string };
export function detectArch(platform: string, arch: string, env: Record<string, string | undefined>): ArchInfo {
  const isTermux = Boolean(env.TERMUX_VERSION) || (env.PREFIX ?? "").includes("com.termux");
  const bunAsset = arch === "arm64" ? "bun-linux-aarch64.zip" : arch === "x64" ? "bun-linux-x64.zip" : `bun-linux-${arch}.zip`;
  const ripgrepAsset = arch === "arm64" ? "ripgrep-*-aarch64-unknown-linux-gnu.tar.gz" : "ripgrep-*-x86_64-unknown-linux-gnu.tar.gz";
  return { platform, arch, isTermux, bunAsset, ripgrepAsset };
}
export function termuxHome(env: Record<string, string | undefined>): string {
  return env.HOME ?? (env.PREFIX ? `${env.PREFIX}/../` : "/data/data/com.termux/files/home");
}
