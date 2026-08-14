-- Schema: NonPwdLogin (MySQL)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          CHAR(36) PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  totp_secret TEXT NOT NULL,
  confirm_token VARCHAR(64),
  confirmed   TINYINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- Login audit trail
CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  success     TINYINT NOT NULL,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_created ON login_attempts(created_at);

-- TOTP reset history
CREATE TABLE IF NOT EXISTS totp_resets (
  id          CHAR(36) PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  old_secret  TEXT NOT NULL,
  new_secret  TEXT NOT NULL,
  reason      VARCHAR(50) DEFAULT 'user_requested',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_totp_resets_user ON totp_resets(user_id);
