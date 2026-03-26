import os from "node:os";
import path from "node:path";
import { readJsonFileWithFallback, writeJsonFileAtomically } from "openclaw/plugin-sdk/json-store";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import type { PlaidStore, PlaidStoredItem } from "./types.js";

const STORE_VERSION = 1;

function createEmptyStore(): PlaidStore {
  return {
    version: STORE_VERSION,
    items: {},
  };
}

export function resolvePlaidStorePath(): string {
  return path.join(resolveStateDir(process.env, os.homedir), "plugins", "plaid", "state.json");
}

export async function readPlaidStore(): Promise<PlaidStore> {
  const storePath = resolvePlaidStorePath();
  const { value } = await readJsonFileWithFallback<PlaidStore>(storePath, createEmptyStore());
  if (!value || typeof value !== "object" || value.version !== STORE_VERSION || !value.items) {
    return createEmptyStore();
  }
  return value;
}

export async function writePlaidStore(store: PlaidStore): Promise<void> {
  await writeJsonFileAtomically(resolvePlaidStorePath(), store);
}

export function listPlaidItems(store: PlaidStore): PlaidStoredItem[] {
  return Object.values(store.items)
    .toSorted((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .reverse();
}

export function resolvePlaidItem(store: PlaidStore, itemOrAlias: string): PlaidStoredItem {
  const needle = itemOrAlias.trim();
  if (!needle) {
    throw new Error("Plaid item id or alias is required.");
  }
  const direct = store.items[needle];
  if (direct) {
    return direct;
  }
  const matched = Object.values(store.items).find((item) => item.alias === needle);
  if (!matched) {
    throw new Error(`Unknown Plaid item or alias: ${needle}`);
  }
  return matched;
}

export function upsertPlaidItem(store: PlaidStore, item: PlaidStoredItem): PlaidStore {
  return {
    ...store,
    items: {
      ...store.items,
      [item.itemId]: item,
    },
  };
}
