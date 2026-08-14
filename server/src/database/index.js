import path from 'path';
import { fileURLToPath } from 'url';
import { createMysqlDriver } from './drivers/mysql.js';
import { runMigrations } from './migrator.js';
import { syncSchema } from './syncer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _driver = null;

export function createDriver(config) {
  return createMysqlDriver();
}

export async function initDb(config, driverOverride) {
  if (_driver) {
    await closeDb();
  }

  const driver = driverOverride || createDriver(config);
  _driver = driver;

  if (driverOverride) {
    return { driver, migrationResult: { applied: [], skipped: [] } };
  }

  await driver.connect(config.db);

  await driver.runSchema();

  const migrationsDir = path.resolve(__dirname, 'migrations');
  const migrationResult = await runMigrations(driver, migrationsDir);

  return { driver, migrationResult };
}

export function getDriver() {
  if (!_driver) {
    throw new Error('Database not initialized. Call initDb(config) first.');
  }
  return _driver;
}

export async function closeDb() {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export function isInitialized() {
  return _driver !== null;
}
