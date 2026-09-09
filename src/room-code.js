const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => alphabet[n % 32]).join('');
}

export function parseRoomCode(input) {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try { value = new URLSearchParams(new URL(value).hash.slice(1)).get('room') ?? ''; }
    catch { return null; }
  }
  value = value.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NP-Z2-9]{8}$/.test(value) ? value : null;
}

export function roomFromHash(hash) {
  return parseRoomCode(new URLSearchParams(hash.slice(1)).get('room') ?? '');
}

export function inviteUrl(href, code) {
  const url = new URL(href);
  url.hash = new URLSearchParams({ room: code }).toString();
  return url.href;
}
