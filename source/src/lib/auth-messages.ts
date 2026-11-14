// Plain-language versions of the auth errors people actually hit.

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function friendlyAuthError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'Something went wrong. Try again.';
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'That email and password do not match. Try again.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists'))
    return 'That email already has an account. Sign in instead.';
  if (m.includes('email') && (m.includes('invalid') || m.includes('validate')))
    return 'That email address does not look right. Check it and try again.';
  if (m.includes('email not confirmed'))
    return 'Confirm your email first. Check your inbox for the link.';
  if (m.includes('rate') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many tries. Wait a minute, then try again.';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('short')))
    return 'Choose a longer password, at least 6 characters.';
  if (m.includes('same password') || m.includes('different from the old'))
    return 'Choose a password you have not used here before.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No connection. Check your internet and try again.';
  return message ?? 'Something went wrong. Try again.';
}
