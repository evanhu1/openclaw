import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import type {
  AccountBase,
  ItemGetResponse,
  RemovedTransaction,
  Transaction,
  TransactionsSyncResponse,
} from "plaid";
import type {
  PlaidResolvedConfig,
  PlaidStoredAccount,
  PlaidStoredItem,
  PlaidStoredTransaction,
} from "./types.js";

export function createPlaidClient(config: PlaidResolvedConfig): PlaidApi {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.environment],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
        },
      },
    }),
  );
}

export function createLinkTokenRequest(params: {
  config: PlaidResolvedConfig;
  clientUserId: string;
  accessToken?: string;
}) {
  const request = {
    user: {
      client_user_id: params.clientUserId,
    },
    client_name: "OpenClaw",
    language: params.config.language,
    country_codes: params.config.countryCodes as CountryCode[],
  } as const;

  if (params.accessToken) {
    return {
      ...request,
      access_token: params.accessToken,
      products: [] as Products[],
    };
  }

  return {
    ...request,
    products: [Products.Transactions],
    transactions: {
      days_requested: params.config.daysRequested,
    },
  };
}

export function normalizeAccount(account: AccountBase): PlaidStoredAccount {
  return {
    accountId: account.account_id,
    name: account.name,
    ...(account.official_name ? { officialName: account.official_name } : {}),
    ...(account.mask ? { mask: account.mask } : {}),
    ...(account.type ? { type: account.type } : {}),
    ...(account.subtype ? { subtype: String(account.subtype) } : {}),
    ...(account.persistent_account_id
      ? { persistentAccountId: account.persistent_account_id }
      : {}),
    balances: {
      ...(typeof account.balances.available === "number"
        ? { available: account.balances.available }
        : {}),
      ...(typeof account.balances.current === "number"
        ? { current: account.balances.current }
        : {}),
      ...(typeof account.balances.limit === "number" ? { limit: account.balances.limit } : {}),
      ...(account.balances.iso_currency_code
        ? { isoCurrencyCode: account.balances.iso_currency_code }
        : {}),
      ...(account.balances.unofficial_currency_code
        ? { unofficialCurrencyCode: account.balances.unofficial_currency_code }
        : {}),
    },
  };
}

export function normalizeTransaction(transaction: Transaction): PlaidStoredTransaction {
  return {
    transactionId: transaction.transaction_id,
    accountId: transaction.account_id,
    date: transaction.date,
    ...(transaction.authorized_date ? { authorizedDate: transaction.authorized_date } : {}),
    name: transaction.name,
    ...(transaction.merchant_name ? { merchantName: transaction.merchant_name } : {}),
    amount: transaction.amount,
    pending: transaction.pending,
    ...(transaction.iso_currency_code ? { isoCurrencyCode: transaction.iso_currency_code } : {}),
    ...(transaction.unofficial_currency_code
      ? { unofficialCurrencyCode: transaction.unofficial_currency_code }
      : {}),
    ...(transaction.category?.length ? { category: transaction.category } : {}),
    ...(transaction.personal_finance_category?.primary
      ? { personalFinanceCategoryPrimary: transaction.personal_finance_category.primary }
      : {}),
    ...(transaction.payment_channel ? { paymentChannel: transaction.payment_channel } : {}),
  };
}

function applySyncPage(params: {
  item: PlaidStoredItem;
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
}) {
  const transactions = { ...params.item.transactions };
  for (const entry of params.added) {
    transactions[entry.transaction_id] = normalizeTransaction(entry);
  }
  for (const entry of params.modified) {
    transactions[entry.transaction_id] = normalizeTransaction(entry);
  }
  for (const entry of params.removed) {
    delete transactions[entry.transaction_id];
  }
  return {
    ...params.item,
    lastSyncCursor: params.nextCursor,
    updatedAt: new Date().toISOString(),
    transactions,
  };
}

export async function refreshPlaidItem(params: {
  client: PlaidApi;
  item: PlaidStoredItem;
}): Promise<{ item: PlaidStoredItem; sync: TransactionsSyncResponse["data"] }> {
  const accountsResponse = await params.client.accountsGet({
    access_token: params.item.accessToken,
  });
  const itemInfoResponse = await params.client.itemGet({
    access_token: params.item.accessToken,
  });

  let currentItem: PlaidStoredItem = {
    ...params.item,
    accounts: accountsResponse.data.accounts.map((entry) => normalizeAccount(entry)),
    ...normalizeItemInfo(itemInfoResponse.data),
    updatedAt: new Date().toISOString(),
  };

  let syncData: TransactionsSyncResponse["data"] | null = null;
  let cursor = currentItem.lastSyncCursor;
  let hasMore = true;
  while (hasMore) {
    const response = await params.client.transactionsSync({
      access_token: currentItem.accessToken,
      ...(cursor ? { cursor } : {}),
      count: 100,
    });
    syncData = response.data;
    cursor = response.data.next_cursor;
    currentItem = applySyncPage({
      item: currentItem,
      added: response.data.added,
      modified: response.data.modified,
      removed: response.data.removed,
      nextCursor: response.data.next_cursor,
    });
    hasMore = response.data.has_more;
  }

  return {
    item: currentItem,
    sync:
      syncData ??
      ({
        added: [],
        modified: [],
        removed: [],
        has_more: false,
        next_cursor: currentItem.lastSyncCursor ?? "",
      } as TransactionsSyncResponse["data"]),
  };
}

export function normalizeItemInfo(data: ItemGetResponse["data"]): Partial<PlaidStoredItem> {
  return {
    ...(data.item.institution_id ? { institutionId: data.item.institution_id } : {}),
  };
}
