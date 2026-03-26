import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { registerPlaidCli } from "./src/cli.js";
import { createPlaidAccountsTool, createPlaidTransactionsTool } from "./src/tools.js";

export default definePluginEntry({
  id: "plaid",
  name: "Plaid",
  description: "Plaid banking tools for secure account and transaction access",
  register(api) {
    api.registerTool(createPlaidAccountsTool(api) as AnyAgentTool, { name: "plaid_accounts" });
    api.registerTool(createPlaidTransactionsTool(api) as AnyAgentTool, {
      name: "plaid_transactions",
    });
    api.registerCli(
      ({ program }) => {
        registerPlaidCli({ api, program });
      },
      { commands: ["plaid"] },
    );
  },
});
