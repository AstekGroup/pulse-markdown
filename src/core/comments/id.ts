// Identifiants de commentaires : "pc-" + 6 caractères base36.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generateCommentId(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `pc-${suffix}`;
}
