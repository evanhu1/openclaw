export type PlaidEnvironment = "sandbox" | "development" | "production";

export type PlaidPluginConfig = {
  api?: {
    clientId?: unknown;
    secret?: unknown;
    environment?: string;
    countryCodes?: string[];
    language?: string;
    daysRequested?: number;
  };
};

export type PlaidResolvedConfig = {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
  countryCodes: string[];
  language: string;
  daysRequested: number;
};

export type PlaidStoredAccount = {
  accountId: string;
  name: string;
  officialName?: string;
  mask?: string;
  type?: string;
  subtype?: string;
  persistentAccountId?: string;
  balances?: {
    available?: number;
    current?: number;
    isoCurrencyCode?: string;
    unofficialCurrencyCode?: string;
    limit?: number;
  };
};

export type PlaidStoredTransaction = {
  transactionId: string;
  accountId: string;
  date: string;
  authorizedDate?: string;
  name: string;
  merchantName?: string;
  amount: number;
  isoCurrencyCode?: string;
  unofficialCurrencyCode?: string;
  pending: boolean;
  category?: string[];
  personalFinanceCategoryPrimary?: string;
  paymentChannel?: string;
};

export type PlaidStoredItem = {
  itemId: string;
  accessToken: string;
  alias?: string;
  institutionId?: string;
  institutionName?: string;
  lastSyncCursor?: string;
  linkedAt: string;
  updatedAt: string;
  accounts: PlaidStoredAccount[];
  transactions: Record<string, PlaidStoredTransaction>;
};

export type PlaidStore = {
  version: 1;
  items: Record<string, PlaidStoredItem>;
};
