import crypto from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { openBrowser } from "./browser.js";
import { createLinkTokenRequest, createPlaidClient } from "./client.js";
import { assertPlaidConfig } from "./config.js";
import { readPlaidStore, resolvePlaidItem, upsertPlaidItem, writePlaidStore } from "./state.js";
import type { PlaidStoredItem } from "./types.js";

type PlaidLinkResult = { ok: true; publicToken?: string } | { ok: false; error: string };

function createLinkPage(params: { linkToken: string; state: string; updateMode: boolean }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenClaw Plaid Link</title>
    <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
    <style>
      body { font-family: sans-serif; padding: 24px; background: #0f172a; color: #e2e8f0; }
      .card { max-width: 640px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
      a { color: #93c5fd; }
      .muted { color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>OpenClaw Plaid Link</h1>
      <p class="muted">This window will close after ${params.updateMode ? "relink" : "link"} finishes.</p>
      <div id="status">Opening Plaid Link...</div>
    </div>
    <script>
      const state = ${JSON.stringify(params.state)};
      const handler = Plaid.create({
        token: ${JSON.stringify(params.linkToken)},
        onSuccess: async (publicToken) => {
          await fetch("/callback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ state, public_token: publicToken })
          });
          document.getElementById("status").textContent = "Success. You can close this window.";
        },
        onExit: async (err) => {
          if (err) {
            await fetch("/callback", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ state, error: err.error_message || err.error_code || "Plaid Link exited with an error." })
            });
            document.getElementById("status").textContent = "Plaid Link exited with an error. Return to the terminal.";
            return;
          }
          await fetch("/callback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ state })
          });
          document.getElementById("status").textContent = "Closed. Return to the terminal.";
        }
      });
      handler.open();
    </script>
  </body>
</html>`;
}

async function readJsonRequest(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runLocalLinkServer(params: {
  linkToken: string;
  updateMode: boolean;
}): Promise<PlaidLinkResult> {
  const expectedState = crypto.randomBytes(16).toString("hex");
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        createLinkPage({
          linkToken: params.linkToken,
          state: expectedState,
          updateMode: params.updateMode,
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/callback") {
      const body = await readJsonRequest(req);
      const state = typeof body.state === "string" ? body.state : "";
      if (state !== expectedState) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        server.emit("plaid-result", {
          ok: false,
          error: "Rejected Plaid callback with mismatched state token.",
        } satisfies PlaidLinkResult);
        return;
      }
      const error = typeof body.error === "string" ? body.error : "";
      const publicToken = typeof body.public_token === "string" ? body.public_token : undefined;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      server.emit(
        "plaid-result",
        error
          ? ({ ok: false, error } satisfies PlaidLinkResult)
          : ({ ok: true, publicToken } satisfies PlaidLinkResult),
      );
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind Plaid Link callback server.");
  }
  const url = `http://127.0.0.1:${(address as AddressInfo).port}/`;
  const opened = await openBrowser(url);
  return await new Promise<PlaidLinkResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(
        new Error(`Timed out waiting for Plaid Link callback. Open this URL manually: ${url}`),
      );
    }, 5 * 60_000);
    server.once("plaid-result", (result: PlaidLinkResult) => {
      clearTimeout(timeout);
      server.close();
      resolve(result);
    });
    if (!opened) {
      // Print after the wait begins so callers always get the same manual fallback.
      process.stdout.write(`Open this URL to continue Plaid Link: ${url}\n`);
    }
  });
}

function buildStoredItem(params: {
  itemId: string;
  accessToken: string;
  alias?: string;
  previous?: PlaidStoredItem;
}): PlaidStoredItem {
  const now = new Date().toISOString();
  return {
    itemId: params.itemId,
    accessToken: params.accessToken,
    ...(params.alias
      ? { alias: params.alias }
      : params.previous?.alias
        ? { alias: params.previous.alias }
        : {}),
    ...(params.previous?.institutionId ? { institutionId: params.previous.institutionId } : {}),
    ...(params.previous?.institutionName
      ? { institutionName: params.previous.institutionName }
      : {}),
    lastSyncCursor: params.previous?.lastSyncCursor,
    linkedAt: params.previous?.linkedAt ?? now,
    updatedAt: now,
    accounts: params.previous?.accounts ?? [],
    transactions: params.previous?.transactions ?? {},
  };
}

export async function linkPlaidItem(params: {
  alias?: string;
  config?: import("openclaw/plugin-sdk/config-runtime").OpenClawConfig;
}): Promise<PlaidStoredItem> {
  const config = assertPlaidConfig(params.config);
  const client = createPlaidClient(config);
  const linkTokenResponse = await client.linkTokenCreate(
    createLinkTokenRequest({
      config,
      clientUserId: `${os.hostname()}:${process.pid}:${Date.now()}`,
    }),
  );
  const result = await runLocalLinkServer({
    linkToken: linkTokenResponse.data.link_token,
    updateMode: false,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  if (!result.publicToken) {
    throw new Error("Plaid Link closed before returning a public token.");
  }
  const exchange = await client.itemPublicTokenExchange({
    public_token: result.publicToken,
  });
  const store = await readPlaidStore();
  const item = buildStoredItem({
    itemId: exchange.data.item_id,
    accessToken: exchange.data.access_token,
    alias: params.alias,
    previous: store.items[exchange.data.item_id],
  });
  await writePlaidStore(upsertPlaidItem(store, item));
  return item;
}

export async function relinkPlaidItem(params: {
  itemOrAlias: string;
  config?: import("openclaw/plugin-sdk/config-runtime").OpenClawConfig;
}): Promise<PlaidStoredItem> {
  const config = assertPlaidConfig(params.config);
  const client = createPlaidClient(config);
  const store = await readPlaidStore();
  const existing = resolvePlaidItem(store, params.itemOrAlias);
  const linkTokenResponse = await client.linkTokenCreate(
    createLinkTokenRequest({
      config,
      clientUserId: `${os.hostname()}:${process.pid}:${Date.now()}`,
      accessToken: existing.accessToken,
    }),
  );
  const result = await runLocalLinkServer({
    linkToken: linkTokenResponse.data.link_token,
    updateMode: true,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  const next = {
    ...existing,
    updatedAt: new Date().toISOString(),
  };
  await writePlaidStore(upsertPlaidItem(store, next));
  return next;
}
