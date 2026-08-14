import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { loadConfig } from '../config.js';
import { generateSecret } from '../services/totp.js';
import { verifyCode } from '../services/totp.js';
import { createUser, findUserByEmail, findUserByConfirmToken, confirmUser } from '../db.js';
import { validateRegisterFields, validateLoginFields } from '../middleware/validate.js';
import { ERR, HTTP, APP_NAME } from '../data/constant.js';

const router = Router();
const config = loadConfig();

router.post('/register', validateRegisterFields, async (req, res) => {
  const { email } = req.body;

  const exists = await findUserByEmail(email);
  if (exists) {
    return res.status(HTTP.CONFLICT).json({ error: ERR.EMAIL_EXISTS });
  }

  const secret = generateSecret();
  const confirmToken = uuid();
  await createUser(email, secret, confirmToken);

  const qrUrl = `otpauth://totp/${APP_NAME}:${email}?secret=${secret}&issuer=${APP_NAME}`;
  const confirmUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}/confirm/${confirmToken}`;

  res.status(HTTP.CREATED).json({ qrUrl, confirmUrl, email });
});

router.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  const user = await findUserByConfirmToken(token);
  if (!user) {
    return res.status(HTTP.NOT_FOUND).json({ error: ERR.INVALID_CONFIRM_TOKEN });
  }

  if (!user.confirmed) {
    await confirmUser(user.id);
  }

  res.json({ secret: user.totpSecret, email: user.email });
});

router.post('/login', validateLoginFields, async (req, res) => {
  const { email, code } = req.body;

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(HTTP.NOT_FOUND).json({ error: ERR.USER_NOT_FOUND });
  }

  if (!user.confirmed) {
    return res.status(HTTP.FORBIDDEN).json({ error: ERR.NOT_CONFIRMED });
  }

  if (!verifyCode(user.totpSecret, code)) {
    return res.status(HTTP.UNAUTHORIZED).json({ error: ERR.INVALID_TOTP });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.json({ token, email: user.email });
});

export default router;
