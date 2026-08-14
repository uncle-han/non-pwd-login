import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../../database/migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

function createMockDriver() {
  const tables = {};
  let migrationsApplied = [];

  const driver = {
    async exec(sql) {
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s+\(([^)]+)\)/i);
      if (createMatch) {
        const [, table] = createMatch;
        if (!tables[table]) {
          tables[table] = true;
        }
      }
    },

    async get(sql, params) {
      return null;
    },

    async all(sql, params) {
      if (sql.includes('SELECT name FROM _migrations')) {
        return migrationsApplied.map(name => ({ name }));
      }
      return [];
    },

    async run(sql, params) {
      return {};
    },

    async getTableNames() {
      return Object.keys(tables).sort();
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

    async getAppliedMigrations() {
      return new Set(migrationsApplied);
    },

    async applyMigration(version, name, sql) {
      migrationsApplied.push(name);
    },

    async close() {
    },
  };

  return { driver, getMigrationsApplied: () => migrationsApplied };
}

describe('runMigrations', () => {
  let driver;
  let getMigrationsApplied;

  beforeEach(async () => {
    const mock = createMockDriver();
    driver = mock.driver;
    getMigrationsApplied = mock.getMigrationsApplied;
  });

  it('applies all pending migration files in order', async () => {
    const result = await runMigrations(driver, MIGRATIONS_DIR);
    expect(result.applied.length).toBeGreaterThanOrEqual(1);
    expect(result.applied[0]).toMatch(/001_initial\.sql/);
  });

  it('does not re-apply already-applied migrations', async () => {
    const first = await runMigrations(driver, MIGRATIONS_DIR);
    const second = await runMigrations(driver, MIGRATIONS_DIR);
    expect(second.applied).toEqual([]);
  });

  it('returns the list of skipped migrations', async () => {
    await runMigrations(driver, MIGRATIONS_DIR);
    const second = await runMigrations(driver, MIGRATIONS_DIR);
    expect(second.skipped.length).toBeGreaterThanOrEqual(1);
    expect(second.skipped[0]).toMatch(/001_initial\.sql/);
  });

  it('creates the _migrations table if it does not exist', async () => {
    const tables = await driver.getTableNames();
    expect(tables).not.toContain('_migrations');

    await runMigrations(driver, MIGRATIONS_DIR);

    const tablesAfter = await driver.getTableNames();
    expect(tablesAfter).toContain('_migrations');
  });

  it('throws for a non-existent migrations directory', async () => {
    await expect(
      runMigrations(driver, '/non/existent/path')
    ).rejects.toThrow(/migrations.*not found|no such directory/i);
  });
});
