const FALLBACK_API_BASE = "http://localhost:8000/api";

const rawApiBase =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  FALLBACK_API_BASE;

const trimmedApiBase = rawApiBase.replace(/\/$/, "");

export const API_BASE = trimmedApiBase.endsWith("/api")
  ? trimmedApiBase
  : `${trimmedApiBase}/api`;
