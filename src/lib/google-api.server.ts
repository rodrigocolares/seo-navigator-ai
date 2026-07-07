/** Thin wrappers over Google Search Console + Analytics Admin APIs. */

export async function listSearchConsoleSites(accessToken: string): Promise<
  Array<{ siteUrl: string; permissionLevel: string }>
> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC list sites failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return data.siteEntry ?? [];
}

export type GA4Account = { name: string; displayName: string };
export type GA4Property = {
  name: string;
  displayName: string;
  parent: string;
  currencyCode?: string;
  timeZone?: string;
};

export async function listAnalyticsAccounts(accessToken: string): Promise<GA4Account[]> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 list accounts failed [${res.status}]: ${body}`);
  }
  return res.json();
}

/** Lists all GA4 properties across all accessible accounts (via accountSummaries). */
export async function listAnalyticsProperties(
  accessToken: string,
): Promise<
  Array<{
    accountId: string;
    accountName: string;
    propertyId: string;
    propertyName: string;
    displayName: string;
  }>
> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 accountSummaries failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as {
    accountSummaries?: Array<{
      account: string;
      displayName: string;
      propertySummaries?: Array<{ property: string; displayName: string }>;
    }>;
  };
  const out: Array<{
    accountId: string;
    accountName: string;
    propertyId: string;
    propertyName: string;
    displayName: string;
  }> = [];
  for (const acc of data.accountSummaries ?? []) {
    const accountId = acc.account?.split("/").pop() ?? "";
    for (const prop of acc.propertySummaries ?? []) {
      const propertyId = prop.property?.split("/").pop() ?? "";
      out.push({
        accountId,
        accountName: acc.displayName,
        propertyId,
        propertyName: prop.property,
        displayName: prop.displayName,
      });
    }
  }
  return out;
}
