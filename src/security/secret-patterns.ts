export function isSensitiveName(value: string): boolean {
  return /(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTH|BEARER|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)/i.test(value);
}

export function looksLikeSecretLiteral(value: string): boolean {
  return /(?:^|[\s"'=:])(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]{20,}|SEC[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:$|[\s"',;])/m.test(
    value,
  );
}
