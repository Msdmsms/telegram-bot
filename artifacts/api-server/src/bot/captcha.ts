export interface CaptchaChallenge {
  question: string;
  answer: number;
  expiresAt: number;
}

const pendingCaptchas = new Map<number, CaptchaChallenge>();

export function generateCaptcha(): CaptchaChallenge {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const useAdd = Math.random() > 0.5;
  const question = useAdd ? `${a} + ${b}` : `${a + b} - ${b}`;
  const answer = useAdd ? a + b : a;
  return {
    question,
    answer,
    expiresAt: Date.now() + 3 * 60 * 1000,
  };
}

export function setCaptcha(userId: number, challenge: CaptchaChallenge) {
  pendingCaptchas.set(userId, challenge);
}

export function verifyCaptcha(userId: number, input: string): "ok" | "wrong" | "expired" | "none" {
  const ch = pendingCaptchas.get(userId);
  if (!ch) return "none";
  if (Date.now() > ch.expiresAt) {
    pendingCaptchas.delete(userId);
    return "expired";
  }
  const num = parseInt(input.trim(), 10);
  if (isNaN(num) || num !== ch.answer) return "wrong";
  pendingCaptchas.delete(userId);
  return "ok";
}

export function hasPendingCaptcha(userId: number): boolean {
  const ch = pendingCaptchas.get(userId);
  if (!ch) return false;
  if (Date.now() > ch.expiresAt) {
    pendingCaptchas.delete(userId);
    return false;
  }
  return true;
}

export function clearCaptcha(userId: number) {
  pendingCaptchas.delete(userId);
}
