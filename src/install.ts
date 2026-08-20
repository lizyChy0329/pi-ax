import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AX_BIN = "ax";
const INSTALL_URL = "https://ax.yusuke.run/install";

/**
 * Check if `ax` is available in PATH.
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
 * Install ax via the official install script.
 *
 * Tries curl first, then wget as fallback.
 * Returns true if installation succeeded, false otherwise.
 */
export function installAx(): boolean {
  // If already installed, no need to reinstall
  if (isAxInstalled()) return true;

  // Try curl
  try {
    execSync("curl --version", { stdio: "ignore" });
    execSync(`curl -fsSL ${INSTALL_URL} | sh`, {
      stdio: "inherit",
      timeout: 60_000,
    });
    return isAxInstalled();
  } catch {
    // curl failed or wasn't found
  }

  // Try wget as fallback
  try {
    execSync("wget --version", { stdio: "ignore" });
    execSync(`wget -qO- ${INSTALL_URL} | sh`, {
      stdio: "inherit",
      timeout: 60_000,
    });
    return isAxInstalled();
  } catch {
    // wget also failed
  }

  return false;
}

/**
 * Install ax to a custom location (e.g., ~/.pi/agent/bin/ax).
 * This avoids the need for sudo when the default install script
 * targets /usr/local/bin/.
 */
export function installAxToPiDir(): boolean {
  const piBinDir = join(homedir(), ".pi", "agent", "bin");
  const axPath = join(piBinDir, "ax");

  if (existsSync(axPath)) {
    try {
      execSync(`${axPath} --version`, { stdio: "ignore" });
      return true;
    } catch {
      // Binary exists but is broken, reinstall
    }
  }

  // Download the ax binary directly
  // The install script sources from GitHub releases
  const os = process.platform;
  const arch = process.arch === "x64" ? "x86_64" : process.arch;

  // Determine download URL based on platform
  let downloadUrl: string;
  const ext = os === "win32" ? ".exe" : "";

  // Map Node.js process.platform to the release asset naming
  // ax releases use: ax-{os}-{arch} (e.g., ax-linux-x86_64)
  const osMap: Record<string, string> = {
    linux: "linux",
    darwin: "darwin",
    win32: "windows",
  };
  const archMap: Record<string, string> = {
    x64: "x86_64",
    arm64: "aarch64",
    arm: "armv7l",
  };

  const targetOs = osMap[os];
  const targetArch = archMap[arch] ?? arch;

  if (!targetOs) {
    return false;
  }

  // Try to get the latest version from the install script, or use a known URL
  // The install script resolves to: https://github.com/yusukebe/ax/releases/latest/download/ax-{os}-{arch}
  downloadUrl = `https://github.com/yusukebe/ax/releases/latest/download/ax-${targetOs}-${targetArch}${ext}`;

  try {
    mkdirSync(piBinDir, { recursive: true });

    // Download with curl
    execSync(`curl -fsSL -o "${axPath}" "${downloadUrl}"`, {
      timeout: 60_000,
    });

    // Make executable
    if (os !== "win32") {
      execSync(`chmod +x "${axPath}"`);
    }

    // Verify
    execSync(`${axPath} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure ax is installed and available.
 * Returns true if ax is ready, false otherwise.
 */
export function ensureAxInstalled(): boolean {
  if (isAxInstalled()) return true;

  // Try installing to pi's bin directory first (no sudo needed)
  if (installAxToPiDir()) return true;

  // Try the official install script as fallback
  return installAx();
}