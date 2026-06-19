const express = require('express');
const db = require('../db');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

function enrichPlan(plan, vehicles, freqs, dispatches, signals) {
  if (!plan) return plan;
  const v = vehicles.find(x => x.id === plan.vehicle_id);
  const f = freqs.find(x => x.id === plan.frequency_id);
  const d = dispatches.find(x => x.plan_id === plan.id);
  const sig = (signals || []).filter(s => s.plan_id === plan.id)
    .sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
  return {
    ...plan,
    vehicle_name: v?.name, vehicle_code: v?.code, vehicle_status: v?.status,
    frequency_code: f?.code, frequency: f?.frequency, band: f?.band,
    dispatch_id: d?.id, dispatch_note: d?.note, dispatched_at: d?.created_at,
    signal_records: sig
  };
}

router.get('/', (req, res) => {
  const { status, start_date, end_date, producer_id } = req.query;
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  const dispatches = db.prepare('SELECT * FROM dispatches').all();
  const signals = db.prepare('SELECT * FROM signal_records').all();

  let result = plans;
  if (status) result = result.filter(p => p.status === status);
  if (start_date) result = result.filter(p => p.end_time >= start_date);
  if (end_date) result = result.filter(p => p.start_time <= end_date);
  if (producer_id) result = result.filter(p => p.producer_id == producer_id);
  result.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));

  result = result.map(p => enrichPlan(p, vehicles, freqs, dispatches, signals));
  res.json(result);
});

router.get('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  const dispatches = db.prepare('SELECT * FROM dispatches').all();
  const signals = db.prepare('SELECT * FROM signal_records').all();
  res.json(enrichPlan(plan, vehicles, freqs, dispatches, signals));
});

router.post('/', (req, res) => {
  const { title, location, start_time, end_time, producer_id, producer_name, description } = req.body;
  if (!title || !location || !start_time || !end_time || !producer_id || !producer_name) {
    return res.status(400).json({ error: '标题、地点、时间、制片信息不能为空' });
  }
  if (new Date(start_time) >= new Date(end_time)) {
    return res.status(400).json({ error: '开始时间必须早于结束时间' });
  }
  const info = db.prepare(`
    INSERT INTO broadcast_plans (title, location, start_time, end_time, producer_id, producer_name, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(title, location, start_time, end_time, producer_id, producer_name, description || '');
  const plan = db._data.broadcast_plans.find(p => p.id === info.lastInsertRowid);
  res.status(201).json(plan);
});

router.put('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status === 'ended') {
    return res.status(400).json({ error: '已结束的直播计划不能修改' });
  }
  if (['dispatched', 'ongoing'].includes(plan.status)) {
    return res.status(400).json({ error: '已调度或进行中的直播计划不能修改，请先取消调度' });
  }
  const { title, location, start_time, end_time, description } = req.body;
  if (start_time && end_time && new Date(start_time) >= new Date(end_time)) {
    return res.status(400).json({ error: '开始时间必须早于结束时间' });
  }
  const data = db._data;
  const idx = data.broadcast_plans.findIndex(p => p.id == req.params.id);
  if (idx >= 0) {
    data.broadcast_plans[idx] = {
      ...data.broadcast_plans[idx],
      title: title ?? data.broadcast_plans[idx].title,
      location: location ?? data.broadcast_plans[idx].location,
      start_time: start_time ?? data.broadcast_plans[idx].start_time,
      end_time: end_time ?? data.broadcast_plans[idx].end_time,
      description: description ?? data.broadcast_plans[idx].description,
      updated_at: nowIso()
    };
    db._data = data;
  }
  const updated = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (['dispatched', 'ongoing', 'ended'].includes(plan.status)) {
    return res.status(400).json({ error: '该状态的直播计划不能删除' });
  }
  const data = db._data;
  data.broadcast_plans = data.broadcast_plans.filter(p => p.id != req.params.id);
  db._data = data;
  res.json({ message: '删除成功', id: req.params.id });
});

router.post('/:id/cancel', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status === 'ongoing') {
    return res.status(400).json({ error: '直播进行中，不能取消' });
  }
  if (plan.status === 'ended') {
    return res.status(400).json({ error: '直播已结束，不能取消' });
  }
  const data = db._data;
  const pIdx = data.broadcast_plans.findIndex(p => p.id == req.params.id);
  if (pIdx >= 0) {
    const prev = data.broadcast_plans[pIdx];
    data.broadcast_plans[pIdx] = {
      ...prev,
      status: 'cancelled',
      updated_at: nowIso()
    };
    if (prev.vehicle_id) {
      const others = data.broadcast_plans.filter(p =>
        p.vehicle_id === prev.vehicle_id
        && ['dispatched', 'ongoing'].includes(p.status)
        && p.id != prev.id
      );
      if (others.length === 0) {
        const vIdx = data.vehicles.findIndex(v => v.id === prev.vehicle_id);
        if (vIdx >= 0) {
          data.vehicles[vIdx] = { ...data.vehicles[vIdx], status: 'available', updated_at: nowIso() };
        }
      }
    }
    db._data = data;
  }
  res.json({ message: '已取消', id: req.params.id, status: 'cancelled' });
});

router.post('/:id/start', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status !== 'dispatched') {
    return res.status(400).json({ error: '只有已调度的计划可以开始直播' });
  }
  const { engineer_id, engineer_name } = req.body;
  const data = db._data;
  const idx = data.broadcast_plans.findIndex(p => p.id == req.params.id);
  if (idx >= 0) {
    data.broadcast_plans[idx] = {
      ...data.broadcast_plans[idx],
      status: 'ongoing',
      engineer_id: engineer_id ?? data.broadcast_plans[idx].engineer_id,
      engineer_name: engineer_name ?? data.broadcast_plans[idx].engineer_name,
      started_at: nowIso(),
      updated_at: nowIso()
    };
    db._data = data;
  }
  res.json({ message: '直播已开始', id: req.params.id, status: 'ongoing' });
});

router.post('/:id/end', (req, res) => {
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status !== 'ongoing') {
    return res.status(400).json({ error: '只有进行中的计划可以结束' });
  }
  const data = db._data;
  const idx = data.broadcast_plans.findIndex(p => p.id == req.params.id);
  if (idx >= 0) {
    data.broadcast_plans[idx] = {
      ...data.broadcast_plans[idx],
      status: 'ended',
      ended_at: nowIso(),
      updated_at: nowIso()
    };
    if (plan.vehicle_id) {
      const others = data.broadcast_plans.filter(p =>
        p.vehicle_id === plan.vehicle_id
        && ['dispatched', 'ongoing'].includes(p.status)
        && p.id != plan.id
      );
      if (others.length === 0) {
        const vIdx = data.vehicles.findIndex(v => v.id === plan.vehicle_id);
        if (vIdx >= 0) {
          data.vehicles[vIdx] = { ...data.vehicles[vIdx], status: 'available', updated_at: nowIso() };
        }
      }
    }
    db._data = data;
  }
  res.json({ message: '直播已结束', id: req.params.id, status: 'ended' });
});

module.exports = router;
