import fs from 'fs';
import path from 'path';

export async function runMigrations(driver, migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  await driver.exec(driver.getMigrationsTableSql());

  const applied = await driver.getAppliedMigrations();
  const result = { applied: [], skipped: [] };

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const version = parseInt(file.split('_')[0], 10);

    if (isNaN(version)) {
      continue;
    }

    await driver.applyMigration(version, file, sql);
    result.applied.push(file);
  }

  return result;
}
