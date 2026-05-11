import { spawnSync } from "node:child_process";

export function runLark(args, { execute = false } = {}) {
  const command = ["lark-cli", ...args];
  if (!execute) {
    return { dryRun: true, command: command.map(shellQuote).join(" ") };
  }

  const result = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`命令执行失败：${command.join(" ")}\n${details}`);
  }

  return parseOutput(result.stdout);
}

export function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { stdout: trimmed };
  }
}
