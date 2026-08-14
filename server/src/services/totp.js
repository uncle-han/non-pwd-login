import { authenticator } from 'otplib';

authenticator.options = {
  algorithm: 'sha1',
  digits: 6,
  step: 30,
  window: 1,
};

export { authenticator };

export function generateSecret() {
  return authenticator.generateSecret(20);
}

export function generateCode(secret) {
  return authenticator.generate(secret);
}

export function verifyCode(secret, code) {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
