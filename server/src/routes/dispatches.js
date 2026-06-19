const express = require('express');
const db = require('../db');

const router = express.Router();

function nowIso() { return new Date().toISOString(); }

function sameId(a, b) {
  if (a == null || b == null) return a === b;
  return String(a) === String(b);
}

function enrichPlan(p, vehicles, freqs) {
  if (!p) return p;
  const v = vehicles.find(x => sameId(x.id, p.vehicle_id));
  const f = freqs.find(x => sameId(x.id, p.frequency_id));
  return {
    ...p,
    vehicle_name: v?.name, vehicle_code: v?.code, vehicle_status: v?.status,
    frequency_code: f?.code, frequency: f?.frequency, band: f?.band
  };
}

router.post('/', (req, res) => {
  let { plan_id, vehicle_id, frequency_id, note, notes } = req.body;
  const dispatcher_id = req.body.dispatcher_id ?? req.body.operator_id;
  const dispatcher_name = req.body.dispatcher_name ?? req.body.operator_name;
  const finalNote = note ?? notes ?? '';

  if (!plan_id || !vehicle_id || !frequency_id || !dispatcher_id || !dispatcher_name) {
    return res.status(400).json({ error: '计划、车辆、频率、调度员信息不能为空' });
  }

  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();

  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status !== 'pending') {
    return res.status(400).json({ error: '只有待调度状态的计划可以分配资源' });
  }

  const vehicle = vehicles.find(v => sameId(v.id, vehicle_id));
  if (!vehicle) {
    return res.status(404).json({ error: '车辆不存在' });
  }
  if (vehicle.status === 'maintenance') {
    return res.status(400).json({
      error: '该车辆正在检修中，无法调度',
      code: 'VEHICLE_MAINTENANCE'
    });
  }

  const allPlans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicleConflict = allPlans
    .filter(bp => sameId(bp.vehicle_id, vehicle_id)
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && !sameId(bp.id, plan_id)
      && bp.start_time < plan.end_time && bp.end_time > plan.start_time)
    .map(bp => enrichPlan(bp, vehicles, freqs));

  if (vehicleConflict.length > 0) {
    return res.status(400).json({
      error: '该车辆在此时段已有排期',
      code: 'VEHICLE_CONFLICT',
      conflicts: vehicleConflict
    });
  }

  const maintenances = db.prepare('SELECT * FROM vehicle_maintenance').all();
  const maintenanceConflict = maintenances.filter(m =>
    sameId(m.vehicle_id, vehicle_id) && m.start_time < plan.end_time && m.end_time > plan.start_time
  );
  if (maintenanceConflict.length > 0) {
    return res.status(400).json({
      error: '该车辆在此时段有检修安排，无法调度',
      code: 'VEHICLE_MAINTENANCE_SCHEDULED',
      conflicts: maintenanceConflict
    });
  }

  const frequency = freqs.find(f => sameId(f.id, frequency_id));
  if (!frequency) {
    return res.status(404).json({ error: '频率不存在' });
  }

  const freqConflict = allPlans
    .filter(bp => sameId(bp.frequency_id, frequency_id)
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && !sameId(bp.id, plan_id)
      && bp.start_time < plan.end_time && bp.end_time > plan.start_time)
    .map(bp => enrichPlan(bp, vehicles, freqs));

  if (freqConflict.length > 0) {
    return res.status(400).json({
      error: '该频率在此时段已被占用',
      code: 'FREQUENCY_CONFLICT',
      conflicts: freqConflict
    });
  }

  const sameCityFreqConflict = allPlans
    .filter(bp => sameId(bp.frequency_id, frequency_id)
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && !sameId(bp.id, plan_id)
      && bp.city === plan.city
      && bp.city != null && bp.city !== ''
      && bp.start_time < plan.end_time && bp.end_time > plan.start_time)
    .map(bp => enrichPlan(bp, vehicles, freqs));

  if (sameCityFreqConflict.length > 0) {
    return res.status(400).json({
      error: `该频率在${plan.city || '同城市'}已有其他直播占用，频率冲突不能下发`,
      code: 'FREQUENCY_SAME_CITY_CONFLICT',
      conflicts: sameCityFreqConflict,
      city: plan.city
    });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO dispatches (plan_id, vehicle_id, frequency_id, dispatcher_id, dispatcher_name, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(plan_id, vehicle_id, frequency_id, dispatcher_id, dispatcher_name, finalNote);

    const data = db._data;
    const pIdx = data.broadcast_plans.findIndex(r => r.id === plan_id);
    if (pIdx >= 0) {
      data.broadcast_plans[pIdx] = {
        ...data.broadcast_plans[pIdx],
        status: 'dispatched',
        vehicle_id,
        frequency_id,
        dispatcher_id,
        updated_at: nowIso()
      };
    }
    const vIdx = data.vehicles.findIndex(r => r.id === vehicle_id);
    if (vIdx >= 0) {
      data.vehicles[vIdx] = { ...data.vehicles[vIdx], status: 'in_use', updated_at: nowIso() };
    }
    db._data = data;
  });
  tx();

  const dispatch = db.prepare('SELECT * FROM dispatches WHERE plan_id = ?').get(plan_id);
  const finalPlan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(plan_id);
  const finalVehicle = vehicles.find(v => v.id === vehicle_id);
  const finalFreq = freqs.find(f => f.id === frequency_id);

  res.status(201).json({
    ...dispatch,
    plan_title: finalPlan?.title,
    start_time: finalPlan?.start_time,
    end_time: finalPlan?.end_time,
    vehicle_name: finalVehicle?.name,
    vehicle_code: finalVehicle?.code,
    frequency_code: finalFreq?.code,
    frequency: finalFreq?.frequency
  });
});

router.get('/', (req, res) => {
  const dispatches = db.prepare('SELECT * FROM dispatches').all();
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();

  const result = dispatches.map(d => {
    const bp = plans.find(p => sameId(p.id, d.plan_id));
    const v = vehicles.find(x => sameId(x.id, d.vehicle_id));
    const f = freqs.find(x => sameId(x.id, d.frequency_id));
    return {
      ...d,
      plan_title: bp?.title, start_time: bp?.start_time, end_time: bp?.end_time,
      plan_status: bp?.status, location: bp?.location, producer_name: bp?.producer_name,
      vehicle_name: v?.name, vehicle_code: v?.code,
      frequency_code: f?.code, frequency: f?.frequency, band: f?.band
    };
  }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  res.json(result);
});

router.get('/:plan_id', (req, res) => {
  const dispatch = db.prepare('SELECT * FROM dispatches WHERE plan_id = ?').get(req.params.plan_id);
  if (!dispatch) {
    return res.status(404).json({ error: '调度记录不存在' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  const bp = plans.find(p => sameId(p.id, dispatch.plan_id));
  const v = vehicles.find(x => sameId(x.id, dispatch.vehicle_id));
  const f = freqs.find(x => sameId(x.id, dispatch.frequency_id));

  res.json({
    ...dispatch,
    plan_title: bp?.title, start_time: bp?.start_time, end_time: bp?.end_time,
    plan_status: bp?.status, location: bp?.location, producer_name: bp?.producer_name,
    plan_description: bp?.description,
    vehicle_name: v?.name, vehicle_code: v?.code,
    frequency_code: f?.code, frequency: f?.frequency, band: f?.band
  });
});

router.delete('/:plan_id', (req, res) => {
  const dispatch = db.prepare('SELECT * FROM dispatches WHERE plan_id = ?').get(req.params.plan_id);
  if (!dispatch) {
    return res.status(404).json({ error: '调度记录不存在' });
  }
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(req.params.plan_id);
  if (plan && plan.status === 'ongoing') {
    return res.status(400).json({ error: '直播进行中，不能取消调度' });
  }
  if (plan && plan.status === 'ended') {
    return res.status(400).json({ error: '直播已结束，调度记录不可撤回' });
  }

  const tx = db.transaction(() => {
    const data = db._data;
    if (dispatch.vehicle_id) {
      const inUseCount = data.broadcast_plans.filter(p =>
        sameId(p.vehicle_id, dispatch.vehicle_id)
        && ['dispatched', 'ongoing'].includes(p.status)
        && !sameId(p.id, req.params.plan_id)
      ).length;
      if (inUseCount === 0) {
        const idx = data.vehicles.findIndex(v => sameId(v.id, dispatch.vehicle_id));
        if (idx >= 0) {
          data.vehicles[idx] = { ...data.vehicles[idx], status: 'available', updated_at: nowIso() };
        }
      }
    }
    data.dispatches = data.dispatches.filter(d => !sameId(d.plan_id, req.params.plan_id));
    const pIdx = data.broadcast_plans.findIndex(p => sameId(p.id, req.params.plan_id));
    if (pIdx >= 0) {
      data.broadcast_plans[pIdx] = {
        ...data.broadcast_plans[pIdx],
        status: 'pending',
        vehicle_id: null,
        frequency_id: null,
        dispatcher_id: null,
        updated_at: nowIso()
      };
    }
    db._data = data;
  });
  tx();

  res.json({ message: '调度已取消', plan_id: req.params.plan_id });
});

module.exports = router;
