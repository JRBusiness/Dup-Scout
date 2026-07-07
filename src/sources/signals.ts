const SECURITY_RE = /\b(fix|fixes|fixed|vuln|vulnerability|security|exploit|audit|patch|reentran|overflow|underflow)\b/i;

export function securitySignals(title: string): string[] {
  return SECURITY_RE.test(title) ? ["security-title"] : [];
}
