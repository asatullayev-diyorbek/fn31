const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Browser-side cryptographically random, lowercase-alphanumeric ID of the given length — used for room/invite codes, which are meant to be short and shareable, not secret in the way an auth token is. */
export function randomBytes(length: number): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let result = "";
  for (const value of values) {
    result += ALPHABET[value % ALPHABET.length];
  }
  return result;
}
