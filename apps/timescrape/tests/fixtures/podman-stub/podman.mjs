/**
 * Stand-in for the podman CLI in runner tests. `run` behaves like the scraper
 * container, driven by the `-e=STUB_*` variables of the request; every call is
 * appended to `$STUB_STATE_DIR/calls.log`.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [command, ...args] = process.argv.slice(2);
const stateDir = process.env.STUB_STATE_DIR;
const nameArg = args.find((arg) => arg.startsWith("--name="));
const containerName = nameArg ? nameArg.slice("--name=".length) : args.at(-1);
appendFileSync(join(stateDir, "calls.log"), `${command} ${containerName}\n`);

const pidFile = (name) => join(stateDir, `${name}.pid`);

const runContainer = () => {
  const env = Object.fromEntries(
    args
      .filter((arg) => arg.startsWith("-e="))
      .map((arg) => {
        const pair = arg.slice(3);
        const eq = pair.indexOf("=");
        return [pair.slice(0, eq), pair.slice(eq + 1)];
      })
  );
  const outputMount = args.find((arg) => arg.startsWith("-v=") && arg.includes(":/output:"));
  const outputDir = outputMount.slice(3, outputMount.indexOf(":/output:"));
  const outputFile = join(outputDir, env.TIMESCRAPE_OUTPUT_FILE);

  writeFileSync(pidFile(containerName), String(process.pid));
  if (env.STUB_IGNORE_TERM) process.on("SIGTERM", () => {});
  if (env.STUB_STDOUT) process.stdout.write(env.STUB_STDOUT);
  if (env.STUB_STDERR) process.stderr.write(env.STUB_STDERR);
  if (env.STUB_OUTPUT !== undefined) writeFileSync(outputFile, env.STUB_OUTPUT);
  if (env.STUB_OUTPUT_BYTES) writeFileSync(outputFile, Buffer.alloc(Number(env.STUB_OUTPUT_BYTES), "a"));
  if (env.STUB_SYMLINK) symlinkSync(env.STUB_SYMLINK, outputFile);
  if (env.STUB_FIFO) execFileSync("mkfifo", [outputFile]);

  const exitCode = Number(env.STUB_EXIT ?? 0);
  setTimeout(() => process.exit(exitCode), Number(env.STUB_SLEEP_MS ?? 0));
};

const killContainer = () => {
  if (process.env.STUB_UNKILLABLE) return;
  try {
    process.kill(Number(readFileSync(pidFile(containerName), "utf-8")), "SIGKILL");
  } catch {
    // Already gone.
  }
};

switch (command) {
  case "run":
    runContainer();
    break;
  case "stop":
  case "kill":
  case "rm":
    killContainer();
    break;
  case "unshare":
    rmSync(args.at(-1), { recursive: true, force: true });
    break;
  default:
    process.exit(2);
}
