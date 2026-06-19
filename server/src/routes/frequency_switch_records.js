const express = require('express');
const db = require('../db');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

function sameId(a, b) {
  if (a == null || b == null) return a === b;
  return String(a) === String(b);
}

function enrichSwitchRecord(record, plans, vehicles, freqs) {
  if (!record) return record;
  const bp = plans.find(p => sameId(p.id, record.plan_id));
  const of = freqs.find(f => sameId(f.id, record.old_frequency_id));
  const nf = freqs.find(f => sameId(f.id, record.new_frequency_id));
  const v = vehicles.find(v => sameId(v.id, bp?.vehicle_id));
  return {
    ...record,
    plan_title: bp?.title,
    plan_status: bp?.status,
    location: bp?.location,
    city: bp?.city,
    vehicle_name: v?.name, vehicle_code: v?.code,
    old_frequency_code: of?.code, old_frequency: of?.frequency, old_band: of?.band,
    new_frequency_code: nf?.code, new_frequency: nf?.frequency, new_band: nf?.band
  };
}

router.get('/', (req, res) => {
  const { plan_id, engineer_id } = req.query;
  let records = db.prepare('SELECT * FROM frequency_switch_records').all();
  if (plan_id) records = records.filter(r => sameId(r.plan_id, plan_id));
  if (engineer_id) records = records.filter(r => sameId(r.engineer_id, engineer_id));
  records.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();

  const result = records.map(r => enrichSwitchRecord(r, plans, vehicles, freqs));
  res.json(result);
});

router.get('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM frequency_switch_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '频率切换记录不存在' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  res.json(enrichSwitchRecord(record, plans, vehicles, freqs));
});

router.post('/', (req, res) => {
  const {
    plan_id, old_frequency_id, new_frequency_id,
    engineer_id, engineer_name, reason, note
  } = req.body;

  if (!plan_id || !old_frequency_id || !new_frequency_id || !engineer_id || !engineer_name) {
    return res.status(400).json({ error: '计划ID、原频率、新频率、工程师信息不能为空' });
  }
  if (sameId(old_frequency_id, new_frequency_id)) {
    return res.status(400).json({ error: '新频率不能与原频率相同' });
  }

  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status === 'ended') {
    return res.status(400).json({ error: '直播已结束，不能切换频率' });
  }
  if (plan.status === 'cancelled') {
    return res.status(400).json({ error: '直播已取消，不能切换频率' });
  }
  if (!sameId(plan.frequency_id, old_frequency_id)) {
    return res.status(400).json({ error: '原频率与当前计划分配的频率不一致' });
  }

  const newFreq = db.prepare('SELECT * FROM frequencies WHERE id = ?').get(new_frequency_id);
  if (!newFreq) {
    return res.status(404).json({ error: '新频率不存在' });
  }

  const allPlans = db.prepare('SELECT * FROM broadcast_plans').all();
  const freqConflict = allPlans
    .filter(bp => sameId(bp.frequency_id, new_frequency_id)
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && !sameId(bp.id, plan_id)
      && bp.start_time < plan.end_time && bp.end_time > plan.start_time);

  if (freqConflict.length > 0) {
    const freqs = db.prepare('SELECT * FROM frequencies').all();
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    return res.status(400).json({
      error: '该备用频率此时段已被占用，请选择其他频率',
      code: 'FREQUENCY_CONFLICT',
      conflicts: freqConflict.map(bp => {
        const v = vehicles.find(x => sameId(x.id, bp.vehicle_id));
        const f = freqs.find(x => sameId(x.id, bp.frequency_id));
        return {
          ...bp,
          vehicle_name: v?.name, vehicle_code: v?.code,
          frequency_code: f?.code, frequency: f?.frequency
        };
      })
    });
  }

  const sameCityConflict = allPlans
    .filter(bp => sameId(bp.frequency_id, new_frequency_id)
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && !sameId(bp.id, plan_id)
      && bp.city === plan.city
      && bp.city != null && bp.city !== ''
      && bp.start_time < plan.end_time && bp.end_time > plan.start_time);

  if (sameCityConflict.length > 0) {
    const freqs = db.prepare('SELECT * FROM frequencies').all();
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    return res.status(400).json({
      error: `该备用频率在${plan.city || '同城市'}已有其他直播占用，不能切换`,
      code: 'FREQUENCY_SAME_CITY_CONFLICT',
      conflicts: sameCityConflict.map(bp => {
        const v = vehicles.find(x => sameId(x.id, bp.vehicle_id));
        const f = freqs.find(x => sameId(x.id, bp.frequency_id));
        return {
          ...bp,
          vehicle_name: v?.name, vehicle_code: v?.code,
          frequency_code: f?.code, frequency: f?.frequency
        };
      })
    });
  }

  const tx = db.transaction(() => {
    const now = nowIso();
    db.prepare(`
      INSERT INTO frequency_switch_records (
        plan_id, old_frequency_id, new_frequency_id,
        engineer_id, engineer_name, reason, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan_id, old_frequency_id, new_frequency_id,
      engineer_id, engineer_name, reason || 'signal_abnormal', note || '', now
    );

    const data = db._data;
    const pIdx = data.broadcast_plans.findIndex(p => sameId(p.id, plan_id));
    if (pIdx >= 0) {
      data.broadcast_plans[pIdx] = {
        ...data.broadcast_plans[pIdx],
        frequency_id: new_frequency_id,
        frequency_switched: 1,
        last_frequency_switch_at: now,
        updated_at: now
      };
    }

    const dIdx = data.dispatches.findIndex(d => sameId(d.plan_id, plan_id));
    if (dIdx >= 0) {
      data.dispatches[dIdx] = {
        ...data.dispatches[dIdx],
        frequency_id: new_frequency_id,
        updated_at: now
      };
    }
    db._data = data;
  });
  tx();

  const record = db._data.frequency_switch_records
    .find(r => sameId(r.plan_id, plan_id) && sameId(r.new_frequency_id, new_frequency_id));
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();

  res.status(201).json({
    ...enrichSwitchRecord(record, plans, vehicles, freqs),
    message: '频率已切换到备用频率，原频率占用记录已保留'
  });
});

module.exports = router;
