ALTER TABLE users
  ADD COLUMN confirm_token VARCHAR(64) AFTER totp_secret,
  ADD COLUMN confirmed TINYINT NOT NULL DEFAULT 0 AFTER confirm_token;
