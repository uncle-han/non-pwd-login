export async function syncSchema(driver, desiredSchema) {
  const tables = await driver.getTableNames();

  for (const [table, desiredCols] of Object.entries(desiredSchema)) {
    if (table === '_migrations') continue;

    if (!tables.includes(table)) {
      const colDefs = Object.entries(desiredCols)
        .map(([name, def]) => `\`${name}\` ${def}`)
        .join(', ');
      await driver.exec(`CREATE TABLE IF NOT EXISTS \`${table}\` (${colDefs})`);
      continue;
    }

    const actualCols = await driver.getColumns(table);
    const actualNames = new Set(actualCols.map(c => c.name));
    const desiredNames = Object.keys(desiredCols);

    // Add missing columns
    for (const name of desiredNames) {
      if (!actualNames.has(name)) {
        const def = desiredCols[name];
        await driver.addColumn(table, name, def);
      }
    }

    // Remove extra columns (keep only desired + internal columns)
    for (const col of actualCols) {
      if (!desiredNames.includes(col.name)) {
        await driver.dropColumn(table, col.name);
      }
    }
  }
}


