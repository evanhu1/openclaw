import { describe, expect, it, vi } from "vitest";
import { createLinkTokenRequest } from "./client.js";
import { resolvePlaidConfig } from "./config.js";

describe("plaid config", () => {
  it("resolves secrets from plugin config before env", () => {
    vi.stubEnv("PLAID_CLIENT_ID", "env-client");
    vi.stubEnv("PLAID_SECRET", "env-secret");
    vi.stubEnv("PLAID_ENVIRONMENT", "production");

    const resolved = resolvePlaidConfig({
      plugins: {
        entries: {
          plaid: {
            enabled: true,
            config: {
              api: {
                clientId: "cfg-client",
                secret: "cfg-secret",
                environment: "development",
                countryCodes: ["us", "ca"],
                language: "fr",
                daysRequested: 180,
              },
            },
          },
        },
      },
    });

    expect(resolved).toEqual({
      clientId: "cfg-client",
      secret: "cfg-secret",
      environment: "development",
      countryCodes: ["US", "CA"],
      language: "fr",
      daysRequested: 180,
    });
  });

  it("builds a transactions link token request with days_requested", () => {
    const request = createLinkTokenRequest({
      config: {
        clientId: "client",
        secret: "secret",
        environment: "sandbox",
        countryCodes: ["US"],
        language: "en",
        daysRequested: 365,
      },
      clientUserId: "user-1",
    });

    expect(request.products).toEqual(["transactions"]);
    expect(request.transactions).toEqual({ days_requested: 365 });
  });

  it("builds update mode link token request with access_token", () => {
    const request = createLinkTokenRequest({
      config: {
        clientId: "client",
        secret: "secret",
        environment: "sandbox",
        countryCodes: ["US"],
        language: "en",
        daysRequested: 365,
      },
      clientUserId: "user-1",
      accessToken: "access-token",
    });

    expect(request.access_token).toBe("access-token");
    expect(request.products).toEqual([]);
    expect("transactions" in request).toBe(false);
  });
});
