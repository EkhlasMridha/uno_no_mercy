/**
 * End-to-end smoke test: two headless Chrome tabs (the seat lives in per-tab sessionStorage, so
 * two tabs are two players) create a room, join, ready up and start a game, then check that both
 * hold a full starting hand and can see each other at the table.
 *
 * Needs a running app: `npm run dev`, then `node scripts/e2e-two-players.mjs`.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { STARTING_HAND_SIZE } from '@nomercy/shared';

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns something truthy, or fails with `label`. */
async function waitFor(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      /* not ready yet */
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

// Page-side helpers: click an enabled button by its text, and type into a React-controlled input.
const PAGE_HELPERS = `
  const click = (text) => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => !b.disabled && b.textContent.includes(text),
    );
    button?.click();
    return Boolean(button);
  };
  const fill = (selector, value) => {
    const input = document.querySelector(selector);
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
`;

/** Opens the app in a new tab and returns a function that evaluates page code in it. */
async function openPlayerTab(debugPort) {
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${APP_URL}`, {
    method: 'PUT',
  }).then((res) => res.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let lastId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++lastId;
      pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  return async (code) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: `(() => { ${PAGE_HELPERS} return ${code}; })()`,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  };
}

const profileDir = await mkdtemp(path.join(tmpdir(), 'nomercy-e2e-'));
const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,900',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  const debugPort = await waitFor(
    async () =>
      (await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0],
    'Chrome to start',
  );
  const alpha = await openPlayerTab(debugPort);
  const bravo = await openPlayerTab(debugPort);

  await waitFor(
    () => alpha(`fill('input[autocomplete=nickname]', 'Alpha') && click('Create a room')`),
    'Alpha to open "Create a room"',
  );
  await waitFor(() => alpha(`click('Create room')`), 'Alpha to create the room');
  const code = await waitFor(
    () => alpha(`document.querySelector('button[aria-label^="Room code"]')?.textContent.trim()`),
    'Alpha to reach the lobby',
  );

  await waitFor(
    () =>
      bravo(
        `fill('input[autocomplete=nickname]', 'Bravo') && ` +
          `fill('input[aria-label="Room code"]', ${JSON.stringify(code)}) && click('Join')`,
      ),
    `Bravo to join room ${code}`,
  );
  await waitFor(() => bravo(`click("I'm ready")`), 'Bravo to mark ready');
  await waitFor(() => alpha(`click('Start game')`), 'Alpha to start the game');

  for (const [player, me, opponent] of [
    [alpha, 'Alpha', 'Bravo'],
    [bravo, 'Bravo', 'Alpha'],
  ]) {
    const hand = `ul[aria-label="Your hand, ${STARTING_HAND_SIZE} cards"] > li`;
    await waitFor(
      () => player(`document.querySelectorAll('${hand}').length === ${STARTING_HAND_SIZE}`),
      `${me} to hold ${STARTING_HAND_SIZE} cards`,
    );
    await waitFor(
      () => player(`Boolean(document.querySelector('[aria-label^="${opponent}, "]'))`),
      `${me} to see ${opponent}'s seat`,
    );
  }
  console.log(`E2E passed: room ${code}, both players dealt ${STARTING_HAND_SIZE} cards`);
} catch (error) {
  console.error(`E2E failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  // Chrome keeps writing to its profile while it shuts down, so wait for it before deleting.
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill();
    await exited;
  }
  await rm(profileDir, { recursive: true, force: true });
}
