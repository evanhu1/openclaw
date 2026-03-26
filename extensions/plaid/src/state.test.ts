import { describe, expect, it } from "vitest";
import { listPlaidItems, resolvePlaidItem, upsertPlaidItem } from "./state.js";
import type { PlaidStore, PlaidStoredItem } from "./types.js";

function createItem(overrides: Partial<PlaidStoredItem>): PlaidStoredItem {
  return {
    itemId: "item-1",
    accessToken: "secret-token",
    linkedAt: "2026-03-25T00:00:00.000Z",
    updatedAt: "2026-03-25T00:00:00.000Z",
    accounts: [],
    transactions: {},
    ...overrides,
  };
}

describe("plaid state helpers", () => {
  it("resolves items by alias or item id", () => {
    const store: PlaidStore = {
      version: 1,
      items: {
        "item-1": createItem({ alias: "checking" }),
      },
    };

    expect(resolvePlaidItem(store, "item-1").itemId).toBe("item-1");
    expect(resolvePlaidItem(store, "checking").itemId).toBe("item-1");
  });

  it("sorts most recently updated items first", () => {
    let store: PlaidStore = {
      version: 1,
      items: {},
    };
    store = upsertPlaidItem(
      store,
      createItem({ itemId: "older", updatedAt: "2026-03-24T00:00:00.000Z" }),
    );
    store = upsertPlaidItem(
      store,
      createItem({ itemId: "newer", updatedAt: "2026-03-25T00:00:00.000Z" }),
    );

    expect(listPlaidItems(store).map((item) => item.itemId)).toEqual(["newer", "older"]);
  });
});
