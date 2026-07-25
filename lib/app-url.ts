import { headers } from "next/headers";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function getEnvBaseUrl() {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }

    const normalized = candidate.startsWith("http") ? candidate : `https://${candidate}`;
    return normalizeBaseUrl(normalized);
  }

  return "";
}

export async function getAppBaseUrl() {
  const envBaseUrl = getEnvBaseUrl();

  if (envBaseUrl) {
    return envBaseUrl;
  }

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost || requestHeaders.get("host");

  if (host) {
    const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return normalizeBaseUrl(`${protocol}://${host}`);
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : "";
}

