import { syncSchema } from '../../database/syncer.js';

function createMockDriver() {
  const tables = {};

  const driver = {
    async exec(sql) {
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+`(\w+)`\s+\(([^)]+)\)/i);
      if (createMatch) {
        const [, table, colDefs] = createMatch;
        if (!tables[table]) {
          tables[table] = { columns: {} };
          for (const part of colDefs.split(',')) {
            const trimmed = part.trim();
            const [name, ...typeParts] = trimmed.split(' ');
            tables[table].columns[name.replace(/`/g, '')] = {
              type: typeParts.join(' '),
              pk: typeParts.includes('PRIMARY') && typeParts.includes('KEY'),
              notNull: typeParts.includes('NOT') && typeParts.includes('NULL'),
            };
          }
        }
      }
    },

    async getTableNames() {
      return Object.keys(tables).sort();
    },

    async getColumns(table) {
      const t = tables[table];
      if (!t) return [];
      return Object.entries(t.columns).map(([name, def], i) => ({
        name,
        type: def.type,
        notNull: def.notNull || false,
        default: def.default || null,
        pk: def.pk || false,
      }));
    },

    async addColumn(table, name, definition) {
      if (tables[table]) {
        tables[table].columns[name] = { type: definition.split(' ')[0] };
      }
    },

    async dropColumn(table, name) {
      if (tables[table]) {
        delete tables[table].columns[name];
      }
    },

    async run(sql, params) {
    },
  };

  return { driver, tables };
}

function createSimpleDb(tables, table, columns) {
  tables[table] = {
    columns: {},
  };
  for (const [name, def] of Object.entries(columns)) {
    const parts = def.split(' ');
    tables[table].columns[name] = {
      type: parts[0],
      pk: parts.includes('PRIMARY') && parts.includes('KEY'),
      notNull: parts.includes('NOT') && parts.includes('NULL'),
    };
  }
}

const SAMPLE_SCHEMA = {
  users: {
    id: 'CHAR(36) PRIMARY KEY',
    email: 'VARCHAR(255) NOT NULL',
    totp_secret: 'TEXT NOT NULL',
    created_at: 'TEXT',
  },
};

describe('syncSchema', () => {
  it('adds a missing column to a table', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, 'users', {
      id: 'CHAR(36) PRIMARY KEY',
      email: 'VARCHAR(255) NOT NULL',
    });

    await syncSchema(driver, SAMPLE_SCHEMA);

    const cols = await driver.getColumns('users');
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('totp_secret');
    expect(colNames).toContain('created_at');
  });

  it('removes an extra column from a table', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, 'users', {
      id: 'CHAR(36) PRIMARY KEY',
      email: 'VARCHAR(255) NOT NULL',
      totp_secret: 'TEXT NOT NULL',
      created_at: 'TEXT',
      obsolete_field: 'TEXT',
    });

    await syncSchema(driver, SAMPLE_SCHEMA);

    const cols = await driver.getColumns('users');
    const colNames = cols.map(c => c.name);
    expect(colNames).not.toContain('obsolete_field');
  });

  it('does nothing when schema already matches', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, 'users', {
      id: 'CHAR(36) PRIMARY KEY',
      email: 'VARCHAR(255) NOT NULL',
      totp_secret: 'TEXT NOT NULL',
      created_at: 'TEXT',
    });

    await syncSchema(driver, SAMPLE_SCHEMA);

    const cols = await driver.getColumns('users');
    expect(cols.length).toBe(4);
  });

  it('adds and removes columns in one sync', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, 'users', {
      id: 'CHAR(36) PRIMARY KEY',
      email: 'VARCHAR(255) NOT NULL',
      totp_secret: 'TEXT NOT NULL',
      old_field: 'TEXT',
    });

    await syncSchema(driver, SAMPLE_SCHEMA);

    const cols = await driver.getColumns('users');
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('created_at');
    expect(colNames).not.toContain('old_field');
  });

  it('handles multiple tables', async () => {
    const { driver, tables } = createMockDriver();

    const schema = {
      users: {
        id: 'CHAR(36) PRIMARY KEY',
        email: 'VARCHAR(255) NOT NULL',
      },
      logs: {
        id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        message: 'TEXT NOT NULL',
      },
    };

    createSimpleDb(tables, 'users', {
      id: 'CHAR(36) PRIMARY KEY',
    });

    await syncSchema(driver, schema);

    const userCols = (await driver.getColumns('users')).map(c => c.name);
    expect(userCols).toContain('email');

    const logCols = (await driver.getColumns('logs')).map(c => c.name);
    expect(logCols).toContain('id');
    expect(logCols).toContain('message');
  });

  it('skips tables not in the schema', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, 'users', { id: 'CHAR(36) PRIMARY KEY' });
    createSimpleDb(tables, 'some_internal_table', { val: 'TEXT' });

    await syncSchema(driver, SAMPLE_SCHEMA);

    const tableNames = await driver.getTableNames();
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('some_internal_table');
  });

  it('does not touch the _migrations table', async () => {
    const { driver, tables } = createMockDriver();

    createSimpleDb(tables, '_migrations', {
      version: 'INTEGER PRIMARY KEY',
      name: 'TEXT NOT NULL',
    });

    const schemaWithMigrations = {
      _migrations: {
        version: 'INTEGER PRIMARY KEY',
        name: 'TEXT NOT NULL',
        applied_at: 'TEXT',
      },
    };

    await syncSchema(driver, schemaWithMigrations);

    const cols = await driver.getColumns('_migrations');
    const colNames = cols.map(c => c.name);
    expect(colNames).not.toContain('applied_at');
  });
});
