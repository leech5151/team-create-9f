/**
 * A member id that stays unique across browsers, since members are shared once
 * a 정모 is saved. `randomUUID` needs a secure context; the fallback covers
 * plain-http local testing.
 */
export function newMemberId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
