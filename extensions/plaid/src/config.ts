import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { normalizeSecretInput } from "openclaw/plugin-sdk/provider-auth";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";
import type { PlaidEnvironment, PlaidPluginConfig, PlaidResolvedConfig } from "./types.js";

const DEFAULT_ENVIRONMENT: PlaidEnvironment = "sandbox";
const DEFAULT_COUNTRIES = ["US"];
const DEFAULT_LANGUAGE = "en";
const DEFAULT_DAYS_REQUESTED = 730;

function resolvePluginConfig(cfg?: OpenClawConfig): PlaidPluginConfig | undefined {
  const pluginConfig = cfg?.plugins?.entries?.plaid?.config;
  if (!pluginConfig || typeof pluginConfig !== "object" || Array.isArray(pluginConfig)) {
    return undefined;
  }
  return pluginConfig as PlaidPluginConfig;
}

function normalizeConfiguredSecret(value: unknown, path: string): string | undefined {
  return normalizeSecretInput(
    normalizeResolvedSecretInputString({
      value,
      path,
    }),
  );
}

function normalizeEnvironment(value: string | undefined): PlaidEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "sandbox" || normalized === "development" || normalized === "production") {
    return normalized;
  }
  return DEFAULT_ENVIRONMENT;
}

function normalizeCountryCodes(value: string[] | undefined): string[] {
  const normalized = (value ?? [])
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_COUNTRIES];
}

export function resolvePlaidConfig(cfg?: OpenClawConfig): PlaidResolvedConfig {
  const pluginConfig = resolvePluginConfig(cfg);
  const api = pluginConfig?.api;
  const clientId =
    normalizeConfiguredSecret(api?.clientId, "plugins.entries.plaid.config.api.clientId") ||
    normalizeSecretInput(process.env.PLAID_CLIENT_ID) ||
    "";
  const secret =
    normalizeConfiguredSecret(api?.secret, "plugins.entries.plaid.config.api.secret") ||
    normalizeSecretInput(process.env.PLAID_SECRET) ||
    "";
  const environment = normalizeEnvironment(
    (typeof api?.environment === "string" ? api.environment : undefined) ||
      normalizeSecretInput(process.env.PLAID_ENVIRONMENT) ||
      undefined,
  );
  const countryCodes = normalizeCountryCodes(
    Array.isArray(api?.countryCodes)
      ? api.countryCodes
      : normalizeSecretInput(process.env.PLAID_COUNTRIES)
          ?.split(",")
          .map((entry) => entry.trim()),
  );
  const language =
    (typeof api?.language === "string" ? api.language.trim() : "") ||
    normalizeSecretInput(process.env.PLAID_LANGUAGE) ||
    DEFAULT_LANGUAGE;
  const daysRequested =
    typeof api?.daysRequested === "number" &&
    Number.isFinite(api.daysRequested) &&
    api.daysRequested > 0
      ? Math.floor(api.daysRequested)
      : DEFAULT_DAYS_REQUESTED;

  return {
    clientId,
    secret,
    environment,
    countryCodes,
    language,
    daysRequested,
  };
}

export function assertPlaidConfig(cfg?: OpenClawConfig): PlaidResolvedConfig {
  const resolved = resolvePlaidConfig(cfg);
  if (!resolved.clientId) {
    throw new Error(
      "Plaid client id is required. Set PLAID_CLIENT_ID or configure plugins.entries.plaid.config.api.clientId.",
    );
  }
  if (!resolved.secret) {
    throw new Error(
      "Plaid secret is required. Set PLAID_SECRET or configure plugins.entries.plaid.config.api.secret.",
    );
  }
  return resolved;
}
