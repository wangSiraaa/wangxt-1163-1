const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'live_broadcast.json');

let db = {
  users: [],
  vehicles: [],
  frequencies: [],
  broadcast_plans: [],
  dispatches: [],
  signal_records: [],
  vehicle_maintenance: [],
  frequency_switch_records: [],
  _seq: {
    users: 0,
    vehicles: 0,
    frequencies: 0,
    broadcast_plans: 0,
    dispatches: 0,
    signal_records: 0,
    vehicle_maintenance: 0,
    frequency_switch_records: 0
  }
};

let saveTimer = null;
function saveDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存数据库失败:', e);
    }
  }, 50);
}

function loadDb() {
  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf-8');
      db = JSON.parse(content);
      return true;
    } catch (e) {
      console.error('读取数据库失败，使用默认数据:', e.message);
    }
  }
  return false;
}

function nextId(table) {
  db._seq[table] = (db._seq[table] || 0) + 1;
  saveDb();
  return db._seq[table];
}

function nowIso() {
  return new Date().toISOString();
}

class Statement {
  constructor(sql) {
    this.sql = sql.trim();
  }

  all(...params) {
    const result = this._execute(params);
    return result.rows || [];
  }

  get(...params) {
    const result = this._execute(params);
    return (result.rows && result.rows[0]) || undefined;
  }

  run(...params) {
    return this._execute(params);
  }

  _execute(params) {
    const sql = this.sql;
    const upper = sql.toUpperCase();

    if (upper.startsWith('SELECT')) {
      return { rows: execSelect(sql, params) };
    }
    if (upper.startsWith('INSERT')) {
      return execInsert(sql, params);
    }
    if (upper.startsWith('UPDATE')) {
      return execUpdate(sql, params);
    }
    if (upper.startsWith('DELETE')) {
      return execDelete(sql, params);
    }
    if (upper.startsWith('PRAGMA') || upper.startsWith('CREATE')) {
      return { changes: 0 };
    }
    return { rows: [], changes: 0 };
  }
}

function getTableName(sql) {
  const m = sql.match(/FROM\s+(\w+)/i) || sql.match(/INTO\s+(\w+)/i) || sql.match(/UPDATE\s+(\w+)/i);
  return m ? m[1] : null;
}

function parseWhere(sql) {
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/is);
  if (!whereMatch) return null;
  return whereMatch[1].trim();
}

function evalCondition(cond, row, params, paramIdx) {
  if (!cond) return true;
  const parts = cond.split(/\s+AND\s+/i);
  for (const part of parts) {
    const eqMatch = part.match(/^(\w+)\s*=\s*\?/i);
    const neqMatch = part.match(/^(\w+)\s*!=\s*\?/i);
    const inMatch = part.match(/^(\w+)\s+IN\s*\(([^)]+)\)/i);
    const isNullMatch = part.match(/^(\w+)\s+IS\s+NULL/i);
    const isNotNullMatch = part.match(/^(\w+)\s+IS\s+NOT\s+NULL/i);

    if (eqMatch) {
      const val = params[paramIdx.value++];
      if (row[eqMatch[1]] != val) return false;
    } else if (neqMatch) {
      const val = params[paramIdx.value++];
      if (row[neqMatch[1]] == val) return false;
    } else if (inMatch) {
      const placeholders = inMatch[2].split(',').filter(p => p.trim() === '?');
      const values = placeholders.map(() => params[paramIdx.value++]);
      if (!values.includes(row[inMatch[1]])) return false;
    } else if (isNullMatch) {
      if (row[isNullMatch[1]] != null) return false;
    } else if (isNotNullMatch) {
      if (row[isNotNullMatch[1]] == null) return false;
    } else if (/(\w+)\s*<\s*\?/i.test(part)) {
      const m = part.match(/(\w+)\s*<\s*\?/i);
      const val = params[paramIdx.value++];
      if (!(row[m[1]] < val)) return false;
    } else if (/(\w+)\s*>\s*\?/i.test(part)) {
      const m = part.match(/(\w+)\s*>\s*\?/i);
      const val = params[paramIdx.value++];
      if (!(row[m[1]] > val)) return false;
    }
  }
  return true;
}

function execSelect(sql, params) {
  const table = getTableName(sql);
  if (!table || !db[table]) return [];
  const rows = db[table];
  const where = parseWhere(sql);
  let result = rows.filter(r => {
    const paramIdx = { value: 0 };
    return evalCondition(where, r, params, paramIdx);
  });

  const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    const col = orderMatch[1];
    const dir = (orderMatch[2] || 'ASC').toUpperCase();
    result.sort((a, b) => {
      if (a[col] < b[col]) return dir === 'ASC' ? -1 : 1;
      if (a[col] > b[col]) return dir === 'ASC' ? 1 : -1;
      return 0;
    });
  }

  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    result = result.slice(0, parseInt(limitMatch[1]));
  }

  return result;
}

function parseColumnsValues(sql) {
  const m = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!m) return { columns: [], values: [] };
  const columns = m[1].split(',').map(s => s.trim());
  return { columns, placeholders: m[2].split(',').map(s => s.trim()) };
}

function execInsert(sql, params) {
  const table = getTableName(sql);
  if (!table || !db[table]) return { changes: 0, lastInsertRowid: 0 };
  const { columns, placeholders } = parseColumnsValues(sql);
  const row = { id: nextId(table) };
  let paramIdx = 0;
  columns.forEach((col, i) => {
    if (col !== 'id') {
      const ph = (placeholders[i] || '').trim();
      let val;
      if (ph === '?') {
        val = params[paramIdx++];
      } else if (ph.startsWith("'") && ph.endsWith("'")) {
        val = ph.slice(1, -1);
      } else if (/^-?\d+(\.\d+)?$/.test(ph)) {
        val = ph.includes('.') ? parseFloat(ph) : parseInt(ph, 10);
      } else if (ph.toUpperCase() === 'NULL') {
        val = null;
      } else {
        val = params[paramIdx++];
      }
      if (val === undefined && (col === 'created_at' || col === 'updated_at')) {
        val = nowIso();
      }
      row[col] = val;
    }
  });
  db[table].push(row);
  saveDb();
  return { changes: 1, lastInsertRowid: row.id };
}

function parseSetClause(sql) {
  const m = sql.match(/SET\s+(.+?)\s+WHERE/i) || sql.match(/SET\s+(.+)$/i);
  if (!m) return [];
  const assignments = m[1].split(',').map(s => s.trim());
  return assignments.map(a => {
    const am = a.match(/(\w+)\s*=\s*(.+)/i);
    return am ? { column: am[1], value: am[2].trim() } : null;
  }).filter(Boolean);
}

function execUpdate(sql, params) {
  const table = getTableName(sql);
  if (!table || !db[table]) return { changes: 0 };
  const sets = parseSetClause(sql);
  const where = parseWhere(sql);
  const paramIdx = { value: 0 };
  let changes = 0;
  const setParamStart = paramIdx.value;

  const toUpdate = db[table].filter(r => {
    const saved = paramIdx.value;
    paramIdx.value = sets.length;
    const match = evalCondition(where, r, params, paramIdx);
    paramIdx.value = saved;
    return match;
  });

  paramIdx.value = 0;
  const values = {};
  for (const s of sets) {
    if (s.value === '?') {
      values[s.column] = params[paramIdx.value++];
    } else if (s.value.toUpperCase() === 'DATETIME(\'NOW\')') {
      values[s.column] = nowIso();
    } else if (s.value === 'NULL') {
      values[s.column] = null;
    } else {
      values[s.column] = s.value.replace(/^['"]|['"]$/g, '');
    }
  }

  for (let i = 0; i < db[table].length; i++) {
    if (toUpdate.includes(db[table][i])) {
      db[table][i] = { ...db[table][i], ...values };
      changes++;
    }
  }
  if (changes > 0) saveDb();
  return { changes };
}

function execDelete(sql, params) {
  const table = getTableName(sql);
  if (!table || !db[table]) return { changes: 0 };
  const where = parseWhere(sql);
  const before = db[table].length;
  db[table] = db[table].filter(r => {
    const paramIdx = { value: 0 };
    return !evalCondition(where, r, params, paramIdx);
  });
  const changes = before - db[table].length;
  if (changes > 0) saveDb();
  return { changes };
}

function prepare(sql) {
  return new Statement(sql);
}

function exec(sql) {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    prepare(stmt).run();
  }
}

function pragma() { return {}; }

function initDb() {
  if (loadDb() && db.users && db.users.length > 0) {
    console.log('数据库已存在，加载完成');
    return;
  }

  if (!db._seq) {
    db._seq = {
      users: 0, vehicles: 0, frequencies: 0, broadcast_plans: 0,
      dispatches: 0, signal_records: 0, vehicle_maintenance: 0,
      frequency_switch_records: 0
    };
  }

  const defaultUsers = [
    { username: 'producer1', name: '张制片', role: 'producer' },
    { username: 'producer2', name: '李制片', role: 'producer' },
    { username: 'dispatcher1', name: '王调度', role: 'dispatcher' },
    { username: 'dispatcher2', name: '赵调度', role: 'dispatcher' },
    { username: 'engineer1', name: '陈工程师', role: 'engineer' },
    { username: 'engineer2', name: '刘工程师', role: 'engineer' }
  ];
  defaultUsers.forEach(u => {
    db.users.push({ id: nextId('users'), ...u, created_at: nowIso() });
  });

  const defaultVehicles = [
    { code: 'TRK-001', name: '1号高清转播车', status: 'available', description: '8讯道高清转播车' },
    { code: 'TRK-002', name: '2号高清转播车', status: 'available', description: '6讯道高清转播车' },
    { code: 'TRK-003', name: '3号4K转播车', status: 'available', description: '12讯道4K转播车' },
    { code: 'TRK-004', name: '4号小型转播车', status: 'available', description: '4讯道小型转播车' },
    { code: 'TRK-005', name: '5号卫星转播车', status: 'maintenance', description: '卫星传输转播车-检修中' }
  ];
  defaultVehicles.forEach(v => {
    db.vehicles.push({ id: nextId('vehicles'), ...v, created_at: nowIso(), updated_at: nowIso() });
  });

  const defaultFreqs = [
    { code: 'UHF-01', frequency: 470.5, band: 'UHF', description: 'UHF频段频道1', is_backup: false },
    { code: 'UHF-02', frequency: 506.0, band: 'UHF', description: 'UHF频段频道2', is_backup: false },
    { code: 'UHF-03', frequency: 542.0, band: 'UHF', description: 'UHF频段频道3', is_backup: true },
    { code: 'UHF-04', frequency: 578.0, band: 'UHF', description: 'UHF频段频道4', is_backup: true },
    { code: 'L-01', frequency: 1452.0, band: 'L-Band', description: 'L频段频道1', is_backup: false },
    { code: 'L-02', frequency: 1500.5, band: 'L-Band', description: 'L频段频道2', is_backup: true },
    { code: 'C-01', frequency: 4000.0, band: 'C-Band', description: 'C频段频道1', is_backup: false },
    { code: 'C-02', frequency: 4200.0, band: 'C-Band', description: 'C频段频道2', is_backup: true }
  ];
  defaultFreqs.forEach(f => {
    db.frequencies.push({ id: nextId('frequencies'), ...f, created_at: nowIso() });
  });

  saveDb();
  console.log('数据库初始化完成');
}

initDb();

module.exports = {
  prepare,
  exec,
  pragma,
  get _data() { return db; },
  set _data(v) { db = v; saveDb(); }
};

function transaction(fn) {
  return function() {
    const backup = JSON.parse(JSON.stringify(db));
    try {
      fn();
      saveDb();
    } catch (e) {
      db = backup;
      saveDb();
      throw e;
    }
  };
}

module.exports.transaction = transaction;
