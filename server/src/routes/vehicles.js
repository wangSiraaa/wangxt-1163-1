const express = require('express');
const db = require('../db');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

router.get('/', (req, res) => {
  const { status } = req.query;
  let vehicles = db.prepare('SELECT * FROM vehicles').all();
  if (status) {
    vehicles = vehicles.filter(v => v.status === status);
  }
  vehicles.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  const now = nowIso();
  const maintenances = db.prepare('SELECT * FROM vehicle_maintenance').all();

  const result = vehicles.map(v => ({
    ...v,
    upcoming_maintenances: maintenances
      .filter(m => m.vehicle_id === v.id && (m.end_time || '') >= now)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  }));

  res.json(result);
});

router.get('/:id', (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) {
    return res.status(404).json({ error: '车辆不存在' });
  }
  const maintenances = db.prepare('SELECT * FROM vehicle_maintenance WHERE vehicle_id = ?').all(req.params.id);
  maintenances.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
  res.json({ ...vehicle, maintenances });
});

router.post('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['available', 'in_use', 'maintenance'].includes(status)) {
    return res.status(400).json({ error: '无效的车辆状态' });
  }
  const data = db._data;
  const idx = data.vehicles.findIndex(v => v.id == req.params.id);
  if (idx < 0) {
    return res.status(404).json({ error: '车辆不存在' });
  }
  data.vehicles[idx] = { ...data.vehicles[idx], status, updated_at: nowIso() };
  db._data = data;
  res.json({ id: req.params.id, status });
});

router.post('/:id/maintenance', (req, res) => {
  const { start_time, end_time, reason } = req.body;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: '检修开始和结束时间不能为空' });
  }
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) {
    return res.status(404).json({ error: '车辆不存在' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const conflict = plans.filter(bp =>
    bp.vehicle_id == req.params.id
    && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
    && bp.start_time < end_time && bp.end_time > start_time
  );
  if (conflict.length > 0) {
    return res.status(400).json({
      error: '该时段车辆已有排期，无法安排检修',
      conflicts: conflict
    });
  }
  const info = db.prepare(
    'INSERT INTO vehicle_maintenance (vehicle_id, start_time, end_time, reason) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, start_time, end_time, reason || '');
  res.json({ id: info.lastInsertRowid, vehicle_id: req.params.id });
});

router.get('/:id/availability', (req, res) => {
  const { start_time, end_time } = req.query;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: '请提供查询时间段' });
  }
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) {
    return res.status(404).json({ error: '车辆不存在' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const conflictPlans = plans.filter(bp =>
    bp.vehicle_id == req.params.id
    && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
    && bp.start_time < end_time && bp.end_time > start_time
  );
  const maints = db.prepare('SELECT * FROM vehicle_maintenance').all();
  const conflictMaintenance = maints.filter(m =>
    m.vehicle_id == req.params.id && m.start_time < end_time && m.end_time > start_time
  );
  res.json({
    available: conflictPlans.length === 0 && conflictMaintenance.length === 0 && vehicle.status !== 'maintenance',
    conflict_plans: conflictPlans,
    conflict_maintenance: conflictMaintenance,
    vehicle_status: vehicle.status
  });
});

module.exports = router;
