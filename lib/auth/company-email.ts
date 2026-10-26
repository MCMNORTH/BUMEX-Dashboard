// Who may have an account: the group's addresses (sign-in, sign-up and invitations).
const allowedEmailDomains = ["@bumex.mr", "@bumex.ma"] as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedCompanyEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return allowedEmailDomains.some((domain) => normalizedEmail.endsWith(domain));
}
