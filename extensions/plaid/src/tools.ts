import { Type } from "@sinclair/typebox";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { readBooleanParam } from "openclaw/plugin-sdk/boolean-param";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { createPlaidClient, refreshPlaidItem } from "./client.js";
import { assertPlaidConfig } from "./config.js";
import { readPlaidStore, resolvePlaidItem, upsertPlaidItem, writePlaidStore } from "./state.js";
import type { PlaidStoredTransaction } from "./types.js";

const PlaidAccountsToolSchema = Type.Object(
  {
    item: Type.String({
      description: "Plaid item id or alias to inspect.",
    }),
  },
  { additionalProperties: false },
);

const PlaidTransactionsToolSchema = Type.Object(
  {
    item: Type.String({
      description: "Plaid item id or alias to query.",
    }),
    from: Type.Optional(
      Type.String({
        description: "Inclusive start date in YYYY-MM-DD format.",
      }),
    ),
    to: Type.Optional(
      Type.String({
        description: "Inclusive end date in YYYY-MM-DD format.",
      }),
    ),
    account_id: Type.Optional(
      Type.String({
        description: "Optional Plaid account id filter.",
      }),
    ),
    include_pending: Type.Optional(
      Type.Boolean({
        description: "Include pending transactions. Defaults to false.",
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum number of transactions to return (1-200).",
        minimum: 1,
        maximum: 200,
      }),
    ),
  },
  { additionalProperties: false },
);

function isWithinDateRange(
  transaction: PlaidStoredTransaction,
  from?: string,
  to?: string,
): boolean {
  if (from && transaction.date < from) {
    return false;
  }
  if (to && transaction.date > to) {
    return false;
  }
  return true;
}

async function refreshItem(api: OpenClawPluginApi, itemOrAlias: string) {
  const config = assertPlaidConfig(api.config);
  const store = await readPlaidStore();
  const existing = resolvePlaidItem(store, itemOrAlias);
  const client = createPlaidClient(config);
  const refreshed = await refreshPlaidItem({
    client,
    item: existing,
  });
  const nextStore = upsertPlaidItem(store, refreshed.item);
  await writePlaidStore(nextStore);
  return refreshed.item;
}

export function createPlaidAccountsTool(api: OpenClawPluginApi) {
  return {
    name: "plaid_accounts",
    label: "Plaid Accounts",
    description: "List Plaid accounts for a linked banking item.",
    parameters: PlaidAccountsToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const item = readStringParam(rawParams, "item", { required: true });
      const refreshed = await refreshItem(api, item);
      return jsonResult({
        itemId: refreshed.itemId,
        alias: refreshed.alias,
        institutionId: refreshed.institutionId,
        institutionName: refreshed.institutionName,
        accounts: refreshed.accounts,
      });
    },
  };
}

export function createPlaidTransactionsTool(api: OpenClawPluginApi) {
  return {
    name: "plaid_transactions",
    label: "Plaid Transactions",
    description: "Fetch Plaid transactions for a linked banking item.",
    parameters: PlaidTransactionsToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const item = readStringParam(rawParams, "item", { required: true });
      const from = readStringParam(rawParams, "from") || undefined;
      const to = readStringParam(rawParams, "to") || undefined;
      const accountId = readStringParam(rawParams, "account_id") || undefined;
      const includePending = readBooleanParam(rawParams, "include_pending") ?? false;
      const limit = Math.min(
        200,
        Math.max(1, readNumberParam(rawParams, "limit", { integer: true }) ?? 50),
      );
      const refreshed = await refreshItem(api, item);
      const transactions = Object.values(refreshed.transactions)
        .filter((entry) => (!accountId ? true : entry.accountId === accountId))
        .filter((entry) => (includePending ? true : !entry.pending))
        .filter((entry) => isWithinDateRange(entry, from, to))
        .toSorted((a, b) =>
          a.date === b.date
            ? b.transactionId.localeCompare(a.transactionId)
            : b.date.localeCompare(a.date),
        )
        .slice(0, limit);
      return jsonResult({
        itemId: refreshed.itemId,
        alias: refreshed.alias,
        institutionId: refreshed.institutionId,
        institutionName: refreshed.institutionName,
        count: transactions.length,
        transactions,
      });
    },
  };
}
