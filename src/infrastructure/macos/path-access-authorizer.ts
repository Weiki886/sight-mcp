import type {
  OutsideRootAuthorization,
  OutsideRootAuthorizer,
} from "../filesystem/node-input-guard.js";
import { runOsascriptCommand, type OsascriptCommandRunner } from "./osascript.js";

// The file path is passed as an AppleScript argument (argv) instead of being
// interpolated into the script text, so a path can never inject AppleScript.
const accessDialogScript = [
  "on run argv",
  "  try",
  '    display dialog "Sight MCP wants to read an image outside its configured allowed roots:" & return & return & (first item of argv) & return & return & "Allow this one-time read and send the image to the configured (possibly remote) vision provider?" with title "Sight MCP file access" buttons {"Cancel", "Allow"} default button "Allow" cancel button "Cancel"',
  '    return "ALLOWED"',
  "  on error",
  '    return "DENIED"',
  "  end try",
  "end run",
].join("\n");

export interface MacOSPathAccessAuthorizerOptions {
  readonly run?: OsascriptCommandRunner;
}

export function createMacOSPathAccessAuthorizer(
  options: MacOSPathAccessAuthorizerOptions = {},
): OutsideRootAuthorizer {
  const run = options.run ?? runOsascriptCommand;

  return async (canonicalPath: string, signal: AbortSignal): Promise<OutsideRootAuthorization> => {
    const result = await run(["-e", accessDialogScript, canonicalPath], signal);
    if (result.aborted || result.exitCode === null || result.exitCode !== 0) {
      return "DENIED";
    }
    const status = Buffer.from(result.stdout).toString("utf8").trim();
    return status === "ALLOWED" ? "ALLOWED" : "DENIED";
  };
}
