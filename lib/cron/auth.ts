import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";

  if (!secret || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
