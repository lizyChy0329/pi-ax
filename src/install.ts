import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AX_BIN = "ax";
const INSTALL_URL = "https://ax.yusuke.run/install";
const RELEASES_URL = "https://github.com/yusukebe/ax/releases/latest/download";

/**
 * Check if `ax` is available in PATH or in the pi bin directory.
 */
export function isAxInstalled(): boolean {
  try {
    execSync(`${AX_BIN} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the ax download URL based on current platform and architecture.
 *
 * Release assets (verified from https://github.com/yusukebe/ax/releases/latest):
 *   ax-darwin-arm64
 *   ax-darwin-x64
 *   ax-linux-arm64
 *   ax-linux-x64
 *   ax-windows-x64.exe
 */
function resolveDownloadUrl(): string | null {
  const os = process.platform;
  const arch = process.arch;

  // Node.js process.platform / process.arch → release asset name
  const lookup: Record<string, Record<string, string>> = {
    linux: {
      x64: "ax-linux-x64",
      arm64: "ax-linux-arm64",
    },
    darwin: {
      x64: "ax-darwin-x64",
      arm64: "ax-darwin-arm64",
    },
    win32: {
      x64: "ax-windows-x64.exe",
      arm64: "ax-windows-x64.exe",
    },
  };

  const ext = os === "win32" ? ".exe" : "";
  const asset = lookup[os]?.[arch];
  if (!asset) {
    return null;
  }

  return `${RELEASES_URL}/${asset}${ext}`;
}

/**
 * Install ax to ~/.pi/agent/bin/ax (no sudo needed).
 * Returns true on success, false on failure.
 */
export function installAxToPiDir(): boolean {
  const downloadUrl = resolveDownloadUrl();
  if (!downloadUrl) {
    return false;
  }

  const piBinDir = join(homedir(), ".pi", "agent", "bin");
  const axPath = join(piBinDir, "ax");

  // Already valid — skip
  if (existsSync(axPath)) {
    try {
      execSync(`${axPath} --version`, { stdio: "ignore" });
      return true;
    } catch {
      // Binary exists but broken, overwrite
    }
  }

  try {
    mkdirSync(piBinDir, { recursive: true });
    execSync(`curl -fsSL -o "${axPath}" "${downloadUrl}"`, {
      timeout: 60_000,
    });
    if (process.platform !== "win32") {
      execSync(`chmod +x "${axPath}"`);
    }
    execSync(`${axPath} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install ax via the official install script (curl/wget fallback).
 * Requires network and possibly sudo for /usr/local/bin/.
 */
export function installAx(): boolean {
  if (isAxInstalled()) return true;

  try {
    execSync("curl --version", { stdio: "ignore" });
    execSync(`curl -fsSL ${INSTALL_URL} | sh`, {
      stdio: "inherit",
      timeout: 60_000,
    });
    return isAxInstalled();
  } catch {
    // fall through
  }

  try {
    execSync("wget --version", { stdio: "ignore" });
    execSync(`wget -qO- ${INSTALL_URL} | sh`, {
      stdio: "inherit",
      timeout: 60_000,
    });
    return isAxInstalled();
  } catch {
    // fall through
  }

  return false;
}

/**
 * Ensure ax is installed and available.
 *
 * Priority:
 *  1. Already in PATH
 *  2. Already in ~/.pi/agent/bin/
 *  3. Download to ~/.pi/agent/bin/ (no sudo, verified URL)
 *  4. Official install script (curl/wget, may need sudo)
 *
 * Returns true if ax is ready, false otherwise.
 */
export function ensureAxInstalled(): boolean {
  if (isAxInstalled()) return true;

  // Prefer pi-local install — no sudo required, exact asset URL
  if (installAxToPiDir()) return true;

  // Fall back to the official install script
  return installAx();
}
