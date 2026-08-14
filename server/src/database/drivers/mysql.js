import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMysqlDriver() {
  let conn = null;

  const api = {
    async connect(config) {
      conn = await mysql.createConnection({
        host: config.host || 'localhost',
        port: config.port || 3306,
        user: config.user || 'root',
        password: config.password || '',
        multipleStatements: true,
      });

      const dbName = config.database || 'non_pwd_login';
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await conn.query(`USE \`${dbName}\``);
    },

    async close() {
      if (conn) {
        await conn.end();
        conn = null;
      }
    },

    async exec(sql) {
      await conn.query(sql);
    },

    async get(sql, params) {
      const [rows] = await conn.query(sql, params);
      return rows[0] || null;
    },

    async all(sql, params) {
      const [rows] = await conn.query(sql, params);
      return rows;
    },

    async run(sql, params) {
      const [result] = await conn.query(sql, params);
      return result;
    },

    async getTableNames() {
      const rows = await this.all(
        "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
      );
      return rows.map(r => r.name);
    },

    async getColumns(table) {
      const rows = await this.all(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS \`default\`, COLUMN_KEY AS \`key\`
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [table]
      );
      return rows.map(r => ({
        name: r.name,
        type: r.type,
        notNull: r.nullable === 'NO',
        default: r.default,
        pk: r.key === 'PRI',
      }));
    },

    async addColumn(table, name, definition) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
    },

    async dropColumn(table, name) {
      await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${name}\``);
    },

    async getAppliedMigrations() {
      try {
        const rows = await this.all('SELECT name FROM _migrations');
        return new Set(rows.map(r => r.name));
      } catch {
        return new Set();
      }
    },

    async applyMigration(version, name, sql) {
      await conn.query(sql);
      await conn.query(
        'INSERT IGNORE INTO _migrations (version, name) VALUES (?, ?)',
        [version, name]
      );
    },

    getMigrationsTableSql() {
      return `
        CREATE TABLE IF NOT EXISTS _migrations (
          version    INT PRIMARY KEY,
          name       VARCHAR(255) NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
    },

    async runSchema() {
      const schemaPath = path.join(__dirname, '../schema.mysql.sql');
      if (!fs.existsSync(schemaPath)) return;
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      const statements = sql
        .replace(/^--.*$/gm, '')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (e) {
          if (e.errno === 1061 || e.errno === 1050) continue;
          throw e;
        }
      }
    },
  };

  return api;
}
