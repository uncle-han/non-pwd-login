export function createMockDriver() {
  const tables = {};

  function parseCreateTable(sql) {
    const match = sql.match(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (!match) return null;
    const [, table, colDefs] = match;
    const columns = {};
    for (const part of colDefs.split(',')) {
      const trimmed = part.trim();
      const parts = trimmed.split(/\s+/);
      const name = parts[0].replace(/[`"]/g, '');
      columns[name] = {
        type: parts.slice(1).join(' '),
      };
    }
    return { table, columns };
  }

  function parseValues(sql, params) {
    const insertMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!insertMatch) return null;
    const [, table, colsStr, valsStr] = insertMatch;
    const cols = colsStr.split(',').map(c => c.trim().replace(/[`"]/g, ''));
    const vals = valsStr.split(',').map((v, i) => {
      if (v.trim() === '?') return params[i];
      return v.trim().replace(/^['"]|['"]$/g, '');
    });
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    return { table, row };
  }

  function parseSelect(sql, params) {
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+`?(\w+)`?(?:\s+WHERE\s+(.+))?$/i);
    if (!selectMatch) return null;
    const [, columns, table, whereClause] = selectMatch;
    return { columns: columns.trim(), table, whereClause: whereClause || null };
  }

  function matchRow(row, whereClause, params) {
    if (!whereClause) return true;
    const conditions = whereClause.split(/\s+AND\s+/i);
    let paramIdx = 0;
    for (const cond of conditions) {
      const match = cond.match(/`?(\w+)`?\s*=\s*(\?|'[^']*'|"[^"]*")/);
      if (!match) continue;
      const [, col, val] = match;
      const expected = val === '?' ? params[paramIdx++] : val.replace(/^['"]|['"]$/g, '');
      if (row[col] !== expected) return false;
    }
    return true;
  }

  const driver = {
    _tables: tables,

    async connect(config) {
    },

    async close() {
    },

    async exec(sql) {
      const result = parseCreateTable(sql);
      if (result) {
        if (!tables[result.table]) {
          tables[result.table] = { rows: [], columns: result.columns, autoIncrement: 0 };
        }
        return;
      }
      const deleteMatch = sql.match(/DELETE\s+FROM\s+`?(\w+)`?/i);
      if (deleteMatch) {
        const [, table] = deleteMatch;
        if (tables[table]) {
          tables[table].rows = [];
        }
        return;
      }
    },

    async get(sql, params) {
      const select = parseSelect(sql, params);
      if (select) {
        const t = tables[select.table];
        if (!t) return null;
        const matched = t.rows.filter(row => matchRow(row, select.whereClause, params));
        return matched.length > 0 ? matched[0] : null;
      }
      return null;
    },

    async all(sql, params) {
      const select = parseSelect(sql, params);
      if (select) {
        const t = tables[select.table];
        if (!t) return [];
        return t.rows.filter(row => matchRow(row, select.whereClause, params));
      }
      return [];
    },

    async run(sql, params) {
      const insert = parseValues(sql, params);
      if (insert) {
        const t = tables[insert.table];
        if (!t) {
          tables[insert.table] = { rows: [], columns: {}, autoIncrement: 0 };
        }
        const t2 = tables[insert.table];
        t2.rows.push({ ...insert.row });
        return { insertId: ++t2.autoIncrement };
      }
      const updateMatch = sql.match(
        /UPDATE\s+`?(\w+)`?\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i
      );
      if (updateMatch) {
        const [, table, setClause, whereClause] = updateMatch;
        const t = tables[table];
        if (!t) return {};
        const setParts = setClause.split(',').map(s => s.trim());
        let paramIdx = 0;
        const updates = {};
        for (const part of setParts) {
          const setMatch = part.match(/`?(\w+)`?\s*=\s*(\?|NULL|'[^']*'|\d+)/);
          if (!setMatch) continue;
          const [, col, val] = setMatch;
          if (val === '?') {
            updates[col] = params[paramIdx++];
          } else if (val === 'NULL') {
            updates[col] = null;
          } else if (/^\d+$/.test(val)) {
            updates[col] = Number(val);
          } else {
            updates[col] = val.replace(/^['"]|['"]$/g, '');
          }
        }
        for (let i = 0; i < t.rows.length; i++) {
          if (matchRow(t.rows[i], whereClause, params.slice(paramIdx))) {
            Object.assign(t.rows[i], updates);
          }
        }
        return {};
      }
      return {};
    },

    async getTableNames() {
      return Object.keys(tables).sort();
    },

    async getColumns(table) {
      const t = tables[table];
      if (!t) return [];
      return Object.entries(t.columns).map(([name, def]) => {
        const parts = def.type.split(/\s+/);
        return {
          name,
          type: parts[0],
          notNull: parts.includes('NOT') && parts.includes('NULL'),
          default: null,
          pk: parts.includes('PRIMARY') && parts.includes('KEY'),
        };
      });
    },

    async addColumn(table, name, definition) {
      if (tables[table]) {
        tables[table].columns[name] = { type: definition };
      }
    },

    async dropColumn(table, name) {
      if (tables[table]) {
        delete tables[table].columns[name];
      }
    },

    async getAppliedMigrations() {
      return new Set();
    },

    async applyMigration(version, name, sql) {
    },

    getMigrationsTableSql() {
      return '';
    },

    async runSchema() {
    },
  };

  return driver;
}
