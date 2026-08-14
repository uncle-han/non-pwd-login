import { generateSecret, generateCode, verifyCode } from '../services/totp.js';
import { BASE32_REGEX, CODE_REGEX } from '../data/constant.js';

describe('TOTP Service', () => {

  describe('generateSecret', () => {
    it('returns a 32-character Base32 string', () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[A-Z2-7=]{32}$/);
    });

    it('returns different secrets on each call', () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('generateCode', () => {
    it('returns a 6-digit string for a valid secret', () => {
      const secret = generateSecret();
      const code = generateCode(secret);
      expect(code).toMatch(CODE_REGEX);
    });
  });

  describe('verifyCode', () => {
    it('returns true for a valid code generated from the same secret', () => {
      const secret = generateSecret();
      const code = generateCode(secret);
      expect(verifyCode(secret, code)).toBe(true);
    });

    it('returns false for an invalid code', () => {
      const secret = generateSecret();
      expect(verifyCode(secret, '000000')).toBe(false);
    });

    it('returns false for an invalid secret format', () => {
      expect(verifyCode('invalid!', '123456')).toBe(false);
    });
  });

  describe('consistency', () => {
    it('same secret produces same code within the same time window', () => {
      const secret = generateSecret();
      const code1 = generateCode(secret);
      const code2 = generateCode(secret);
      expect(code1).toBe(code2);
    });

    it('different secrets produce different codes', () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      const c1 = generateCode(s1);
      const c2 = generateCode(s2);
      expect(c1).not.toBe(c2);
    });
  });

});
