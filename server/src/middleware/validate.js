import { EMAIL_REGEX, CODE_REGEX, ERR, HTTP } from '../data/constant.js';

export function validateRegisterFields(req, res, next) {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(HTTP.BAD_REQUEST).json({ error: ERR.INVALID_EMAIL });
  }
  req.body.email = email.trim().toLowerCase();
  next();
}

export function validateLoginFields(req, res, next) {
  const { email, code } = req.body || {};
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(HTTP.BAD_REQUEST).json({ error: ERR.INVALID_EMAIL });
  }
  if (!code || typeof code !== 'string' || !CODE_REGEX.test(code.trim())) {
    return res.status(HTTP.BAD_REQUEST).json({ error: ERR.INVALID_CODE });
  }
  req.body.email = email.trim().toLowerCase();
  req.body.code = code.trim();
  next();
}
