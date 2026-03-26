import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { createPlaidClient, refreshPlaidItem } from "./client.js";
import { assertPlaidConfig, resolvePlaidConfig } from "./config.js";
import { linkPlaidItem, relinkPlaidItem } from "./link.js";
import {
  listPlaidItems,
  readPlaidStore,
  resolvePlaidItem,
  upsertPlaidItem,
  writePlaidStore,
} from "./state.js";

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function registerPlaidCli(params: { api: OpenClawPluginApi; program: Command }) {
  const plaid = params.program
    .command("plaid")
    .description("Link Plaid items and inspect bank transactions");

  plaid
    .command("status")
    .description("Show Plaid config status and linked items")
    .action(async () => {
      const config = resolvePlaidConfig(params.api.config);
      const store = await readPlaidStore();
      printJson({
        configured: Boolean(config.clientId && config.secret),
        environment: config.environment,
        countryCodes: config.countryCodes,
        language: config.language,
        daysRequested: config.daysRequested,
        items: listPlaidItems(store).map((item) => ({
          itemId: item.itemId,
          alias: item.alias,
          institutionId: item.institutionId,
          institutionName: item.institutionName,
          accountCount: item.accounts.length,
          transactionCount: Object.keys(item.transactions).length,
          linkedAt: item.linkedAt,
          updatedAt: item.updatedAt,
        })),
      });
    });

  plaid
    .command("link")
    .description("Open Plaid Link in the browser and store a new linked item")
    .option("--alias <alias>", "Optional alias to store with the new Plaid item")
    .action(async (opts: { alias?: string }) => {
      const item = await linkPlaidItem({
        alias: opts.alias,
        config: params.api.config,
      });
      printJson({
        ok: true,
        itemId: item.itemId,
        alias: item.alias,
        linkedAt: item.linkedAt,
      });
    });

  plaid
    .command("relink")
    .description("Re-open Plaid Link in update mode for an existing item")
    .argument("<item-or-alias>", "Plaid item id or alias")
    .action(async (itemOrAlias: string) => {
      const item = await relinkPlaidItem({
        itemOrAlias,
        config: params.api.config,
      });
      printJson({
        ok: true,
        itemId: item.itemId,
        alias: item.alias,
        updatedAt: item.updatedAt,
      });
    });

  plaid
    .command("items")
    .description("List linked Plaid items without exposing access tokens")
    .action(async () => {
      const store = await readPlaidStore();
      printJson(
        listPlaidItems(store).map((item) => ({
          itemId: item.itemId,
          alias: item.alias,
          institutionId: item.institutionId,
          institutionName: item.institutionName,
          accountCount: item.accounts.length,
          transactionCount: Object.keys(item.transactions).length,
          linkedAt: item.linkedAt,
          updatedAt: item.updatedAt,
        })),
      );
    });

  plaid
    .command("accounts")
    .description("Refresh and print Plaid accounts for one linked item")
    .argument("<item-or-alias>", "Plaid item id or alias")
    .action(async (itemOrAlias: string) => {
      const config = assertPlaidConfig(params.api.config);
      const store = await readPlaidStore();
      const existing = resolvePlaidItem(store, itemOrAlias);
      const refreshed = await refreshPlaidItem({
        client: createPlaidClient(config),
        item: existing,
      });
      await writePlaidStore(upsertPlaidItem(store, refreshed.item));
      printJson({
        itemId: refreshed.item.itemId,
        alias: refreshed.item.alias,
        institutionId: refreshed.item.institutionId,
        institutionName: refreshed.item.institutionName,
        accounts: refreshed.item.accounts,
      });
    });

  plaid
    .command("transactions")
    .description("Refresh and print Plaid transactions for one linked item")
    .argument("<item-or-alias>", "Plaid item id or alias")
    .option("--from <date>", "Inclusive start date in YYYY-MM-DD format")
    .option("--to <date>", "Inclusive end date in YYYY-MM-DD format")
    .option("--account-id <id>", "Filter to a single Plaid account id")
    .option("--include-pending", "Include pending transactions", false)
    .option("--limit <n>", "Maximum number of transactions to print", "50")
    .action(
      async (
        itemOrAlias: string,
        opts: {
          from?: string;
          to?: string;
          accountId?: string;
          includePending?: boolean;
          limit?: string;
        },
      ) => {
        const config = assertPlaidConfig(params.api.config);
        const store = await readPlaidStore();
        const existing = resolvePlaidItem(store, itemOrAlias);
        const refreshed = await refreshPlaidItem({
          client: createPlaidClient(config),
          item: existing,
        });
        await writePlaidStore(upsertPlaidItem(store, refreshed.item));
        const limit = Math.min(
          200,
          Math.max(1, Number.isFinite(Number(opts.limit)) ? Math.floor(Number(opts.limit)) : 50),
        );
        const transactions = Object.values(refreshed.item.transactions)
          .filter((entry) => (!opts.accountId ? true : entry.accountId === opts.accountId))
          .filter((entry) => (opts.includePending ? true : !entry.pending))
          .filter((entry) => (!opts.from ? true : entry.date >= opts.from))
          .filter((entry) => (!opts.to ? true : entry.date <= opts.to))
          .toSorted((a, b) =>
            a.date === b.date
              ? b.transactionId.localeCompare(a.transactionId)
              : b.date.localeCompare(a.date),
          )
          .slice(0, limit);
        printJson({
          itemId: refreshed.item.itemId,
          alias: refreshed.item.alias,
          institutionId: refreshed.item.institutionId,
          institutionName: refreshed.item.institutionName,
          count: transactions.length,
          transactions,
        });
      },
    );
}
