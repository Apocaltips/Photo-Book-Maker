/* global AbortSignal, fetch, process, setTimeout */

import { spawn } from "node:child_process";

const STALE_NEXT_DEV_SERVER_PATTERN = /next dev server is already running/i;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createExitWaiter(child, timeoutMs = 6_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    child.once("close", finish);
    child.once("exit", finish);
    child.once("error", finish);
    setTimeout(finish, timeoutMs);
  });
}

function appendOutput(output, chunk) {
  const nextOutput = `${output}${chunk.toString()}`;
  return nextOutput.length > 40_000 ? nextOutput.slice(-40_000) : nextOutput;
}

export async function isUrlReachable(url, timeoutMs = 1_500) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForUrlDown(url, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isUrlReachable(url, 750))) {
      return true;
    }

    await delay(250);
  }

  return false;
}

export async function waitForHttpOk(
  url,
  { getFailureOutput, label = "Next dev server", timeoutMs = 30_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isUrlReachable(url, 5_000)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`${label} did not become ready.\n${getFailureOutput?.() ?? ""}`);
}

export function createNextDevServerController({
  baseUrl,
  cwd = process.cwd(),
  env,
  label = "Next dev server",
  port,
  readyTimeoutMs = 30_000,
}) {
  let child;
  let output = "";

  function getOutput() {
    return output;
  }

  function startChild() {
    output = "";
    const portArg = String(port);
    if (!/^\d+$/.test(portArg)) {
      throw new Error(`${label} received an invalid port: ${portArg}`);
    }

    child =
      process.platform === "win32"
        ? spawn(`npm.cmd run dev -- --hostname 127.0.0.1 --port ${portArg}`, {
            cwd,
            env,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", portArg], {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
          });

    child.stdout.on("data", (chunk) => {
      output = appendOutput(output, chunk);
    });
    child.stderr.on("data", (chunk) => {
      output = appendOutput(output, chunk);
    });
  }

  async function waitForReadyOrStaleLock() {
    const deadline = Date.now() + readyTimeoutMs;

    while (Date.now() < deadline) {
      if (STALE_NEXT_DEV_SERVER_PATTERN.test(output)) {
        const error = new Error(`${label} reported a stale Next dev server lock.`);
        error.code = "STALE_NEXT_DEV_SERVER";
        throw error;
      }

      if (await isUrlReachable(baseUrl, 5_000)) {
        return;
      }

      if (child?.exitCode !== null && child?.exitCode !== undefined) {
        break;
      }

      await delay(500);
    }

    throw new Error(`${label} did not become ready.\n${output}`);
  }

  async function stop() {
    const childToStop = child;
    child = undefined;

    if (!childToStop) {
      await waitForUrlDown(baseUrl);
      return;
    }

    const waitForExit = createExitWaiter(childToStop);

    if (childToStop.exitCode === null && !childToStop.killed) {
      if (process.platform === "win32" && childToStop.pid) {
        await new Promise((resolve) => {
          const killer = spawn("taskkill", ["/pid", String(childToStop.pid), "/T", "/F"], {
            stdio: "ignore",
          });
          killer.on("exit", resolve);
          killer.on("error", resolve);
        });
      } else {
        childToStop.kill("SIGTERM");
      }
    }

    await waitForExit;
    await waitForUrlDown(baseUrl);
  }

  async function start() {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      startChild();

      try {
        await waitForReadyOrStaleLock();
        return;
      } catch (error) {
        const staleLock = error?.code === "STALE_NEXT_DEV_SERVER";
        const outputBeforeStop = output;
        await stop();

        if (staleLock && attempt === 1 && !(await isUrlReachable(baseUrl))) {
          await delay(1_500);
          continue;
        }

        throw new Error(`${label} did not become ready.\n${outputBeforeStop || error.message}`);
      }
    }
  }

  return {
    getOutput,
    start,
    stop,
  };
}
