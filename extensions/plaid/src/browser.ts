import { spawn } from "node:child_process";

function canOpenGraphicalBrowser(): boolean {
  if (process.platform === "win32" || process.platform === "darwin") {
    return true;
  }
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export async function openBrowser(url: string): Promise<boolean> {
  if (!canOpenGraphicalBrowser()) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }
    if (process.platform === "darwin") {
      spawn("open", [url], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }
    spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return true;
  } catch {
    return false;
  }
}
