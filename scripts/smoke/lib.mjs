// The smoke test's tools (scripts/smoke/run.mjs): the app's server actions over HTTP, a small Chrome DevTools driver,
// an SMTP server that keeps the app's e-mails, and the report.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

// ---- the report ----------------------------------------------------------------------------------------------------

export function report() {
  let failures = 0;
  let total = 0;
  const check = (label, ok, detail = "") => {
    total += 1;
    if (!ok) failures += 1;
    const said = detail === "" ? "" : `  — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 320);
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${said}`);
  };
  return { check, failures: () => failures, total: () => total };
}

// ---- server actions ------------------------------------------------------------------------------------------------

// The answer of a server action: the last line of its flight ("1:…").
function answer(text) {
  const lines = text.split("\n").filter((l) => l.startsWith("1:") && !l.startsWith("1:D"));
  const last = lines.at(-1);
  if (!last) return { raw: text.slice(0, 300) };
  try {
    return JSON.parse(last.slice(2));
  } catch {
    return { raw: last.slice(0, 300) };
  }
}

// act("mariem.sow", "createTicketAction", { args: [...] }) or { prev, form } for a form action; test: on the test floor
// (the session's test mode, 0013: the cookie the app sets there).
export function actions(base, buildDir, cookies) {
  const manifest = JSON.parse(readFileSync(join(buildDir, ".next/server/server-reference-manifest.json"), "utf8"));
  const ids = {};
  for (const [actionId, entry] of Object.entries(manifest.node)) ids[entry.exportedName] = actionId;
  return async function act(who, name, { args, prev, form, test } = {}) {
    if (!ids[name]) throw new Error(`no server action ${name}`);
    const headers = { "Next-Action": ids[name], Accept: "text/x-component", Cookie: `${who ? `__session=${cookies[who]}; ` : ""}bumex-locale=fr${test ? "; bumex-floor-mode=test" : ""}` };
    let body;
    if (form) {
      body = new FormData();
      for (const [k, v] of Object.entries(form)) {
        for (const one of [].concat(v)) {
          if (one instanceof Blob) body.append(`1_${k}`, one, one.name ?? "file");
          else body.append(`1_${k}`, one);
        }
      }
      body.append("0", JSON.stringify(prev === undefined ? ["$K1"] : [prev, "$K1"]));
    } else {
      headers["Content-Type"] = "text/plain;charset=UTF-8";
      body = JSON.stringify(args ?? []);
    }
    const res = await fetch(`${base}/vanguard`, { method: "POST", headers, body, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) return { redirect: res.headers.get("location") ?? res.headers.get("x-action-redirect") };
    const redirect = res.headers.get("x-action-redirect");
    const out = answer(await res.text());
    return redirect ? { redirect, ...out } : out;
  };
}

// ---- Chrome --------------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One tab of headless Chrome (remote debugging on `port`), signed in with the cookies given.
export async function browser(port, base) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  let errors = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    }
  });
  // a call Chrome does not answer in 30 s is an error, not a wait for ever
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++seq;
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`Chrome did not answer ${method} in 30 s`));
      }, 30_000);
      pending.set(n, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split("\n")[0] ?? "evaluation failed");
    return r.result?.result?.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  let noWebgl = null;
  return {
    // without WebGL the app shows its flat building (vanguard/store.ts): the rooms are the same, and Chrome does not
    // draw the 3D one in software behind each of them
    async webgl(on) {
      if (on && noWebgl) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: noWebgl });
      if (!on && !noWebgl) {
        const source = "{ const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : get.call(this, type, ...rest); }; }";
        noWebgl = (await send("Page.addScriptToEvaluateOnNewDocument", { source })).result.identifier;
      }
      if (on) noWebgl = null;
    },
    async setCookie(name, value) {
      await send("Network.setCookie", { name, value, domain: "127.0.0.1", path: "/" });
    },
    async signIn(cookie) {
      await send("Network.clearBrowserCookies");
      if (cookie) await send("Network.setCookie", { name: "__session", value: cookie, domain: "127.0.0.1", path: "/" });
      await send("Network.setCookie", { name: "bumex-locale", value: "fr", domain: "127.0.0.1", path: "/" });
    },
    // in the building's light rendering (?q=low, vanguard/store.ts): Chrome draws it without a GPU here
    async go(path) {
      await send("Page.navigate", { url: `${base}${path}${path.includes("?") ? "&" : "?"}q=low` });
      await sleep(400);
    },
    evaluate,
    // a screen of this size; a phone or a tablet has touch and no hover (screens.mjs)
    async viewport(width, height, { mobile = false, touch = false } = {}) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
      await send("Emulation.setEmulatedMedia", {
        features: touch
          ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }, { name: "any-pointer", value: "coarse" }]
          : [],
      });
    },
    async screenshot(file) {
      const { result } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(result.data, "base64"));
    },
    // waits until the expression is true; false after the timeout
    async until(expression, timeout = 20_000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if ((await evaluate(`Boolean(${expression})`).catch(() => false)) === true) return true;
        await sleep(250);
      }
      return false;
    },
    async cookie(name) {
      const { result } = await send("Network.getCookies", { urls: [base] });
      return result?.cookies?.find((c) => c.name === name)?.value ?? null;
    },
    takeErrors() {
      const out = [...new Set(errors)];
      errors = [];
      return out;
    },
    async close() {
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
      ws.close();
    },
  };
}

// ---- e-mail --------------------------------------------------------------------------------------------------------

// Quoted-printable, as nodemailer writes long lines (the bytes are UTF-8).
const unquote = (text) => Buffer.from(text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8");

// Just enough SMTP for nodemailer (no TLS, AUTH PLAIN with any login): every message is kept, decoded, in `messages`.
export function mailbox(port) {
  const messages = [];
  const server = createServer((socket) => {
    let buffer = "";
    let data = false;
    let message = { to: [], raw: "" };
    const say = (line) => socket.write(`${line}\r\n`);
    say("220 smoke ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1"); // bytes, read as UTF-8 once decoded
      for (;;) {
        if (data) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          message.raw = unquote(buffer.slice(0, end));
          messages.push(message);
          message = { to: [], raw: "" };
          buffer = buffer.slice(end + 5);
          data = false;
          say("250 kept");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO") say("250-smoke\r\n250 AUTH PLAIN");
        else if (verb === "HELO") say("250 smoke");
        else if (verb === "AUTH") say("235 ok");
        else if (verb === "MAIL") say("250 ok");
        else if (verb === "RCPT") { message.to.push(line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, "$1")); say("250 ok"); }
        else if (verb === "DATA") { data = true; say("354 go on"); }
        else if (verb === "QUIT") { say("221 bye"); socket.end(); }
        else if (verb === "RSET" || verb === "NOOP") say("250 ok");
        else say("250 ok");
      }
    });
  });
  return {
    messages,
    start: () => new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve)),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
