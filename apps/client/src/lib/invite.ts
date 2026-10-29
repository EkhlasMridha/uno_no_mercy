import { roomCodeSchema } from '@nomercy/shared';

/** The query parameter an invite link uses to carry its room code. */
const JOIN_PARAM = 'join';

/** A link that opens this app with the room code filled in, ready to join. */
export function inviteUrl(code: string): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(JOIN_PARAM, code);
  return url.toString();
}

/** What "Copy invite" puts on the clipboard: the link, and the code on its own line. */
export function inviteText(code: string): string {
  return `Join my No Mercy game: ${inviteUrl(code)}\nRoom code: ${code}`;
}

/**
 * The room code from an invite link this page was opened with, or null. The parameter is removed
 * from the address bar, so leaving the room later doesn't offer the same invite again.
 */
export function takeInviteCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(JOIN_PARAM);
  if (raw === null) return null;
  params.delete(JOIN_PARAM);
  const rest = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
  );
  const parsed = roomCodeSchema.safeParse(raw.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

/**
 * Copies text to the clipboard. Browsers only offer the Clipboard API on secure pages, and a LAN
 * host is plain http, so it falls back to the older copy command there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the copy command */
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
