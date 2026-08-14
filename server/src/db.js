import { v4 as uuid } from 'uuid';
import { getDriver } from './database/index.js';

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    totpSecret: row.totp_secret,
    confirmToken: row.confirm_token,
    confirmed: Number(row.confirmed) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUser(email, totpSecret, confirmToken) {
  const id = uuid();
  const driver = getDriver();
  await driver.run(
    'INSERT INTO users (id, email, totp_secret, confirm_token, confirmed) VALUES (?, ?, ?, ?, 0)',
    [id, email, totpSecret, confirmToken]
  );
  return { id, email, totpSecret, confirmToken };
}

export async function findUserByEmail(email) {
  const driver = getDriver();
  const row = await driver.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!row) return undefined;
  return mapUserRow(row);
}

export async function findUserByConfirmToken(token) {
  const driver = getDriver();
  const row = await driver.get('SELECT * FROM users WHERE confirm_token = ?', [token]);
  if (!row) return undefined;
  return mapUserRow(row);
}

export async function confirmUser(id) {
  const driver = getDriver();
  await driver.run(
    'UPDATE users SET confirmed = 1 WHERE id = ?',
    [id]
  );
}

export async function clear() {
  const driver = getDriver();
  await driver.exec('DELETE FROM users');
}
