import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * @param {string} filePath
 * @returns {Promise<number|null>} duration in seconds, 1 decimal
 */
export async function probeDurationSec(filePath) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { timeout: 15_000 },
    )
    const n = Number.parseFloat(String(stdout).trim())
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.ceil((n + 0.3) * 10) / 10
  } catch {
    return null
  }
}
