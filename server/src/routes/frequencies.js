const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { band } = req.query;
  let frequencies = db.prepare('SELECT * FROM frequencies').all();
  if (band) {
    frequencies = frequencies.filter(f => f.band === band);
  }
  frequencies.sort((a, b) => (a.frequency || 0) - (b.frequency || 0));
  res.json(frequencies);
});

router.get('/:id/availability', (req, res) => {
  const { start_time, end_time, exclude_plan_id } = req.query;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: '请提供查询时间段' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const conflicts = plans
    .filter(bp =>
      bp.frequency_id == req.params.id
      && ['pending', 'dispatched', 'ongoing'].includes(bp.status)
      && bp.start_time < end_time && bp.end_time > start_time
      && (!exclude_plan_id || bp.id != exclude_plan_id)
    )
    .map(bp => {
      const v = vehicles.find(x => x.id === bp.vehicle_id);
      return { ...bp, vehicle_name: v?.name, vehicle_code: v?.code };
    });
  res.json({ available: conflicts.length === 0, conflicts });
});

router.get('/occupancy', (req, res) => {
  const { start_date, end_date } = req.query;
  const frequencies = db.prepare('SELECT * FROM frequencies').all();
  frequencies.sort((a, b) => (a.frequency || 0) - (b.frequency || 0));

  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();

  let filtered = plans.filter(bp =>
    ['pending', 'dispatched', 'ongoing', 'ended'].includes(bp.status)
    && bp.frequency_id != null
  );
  if (start_date) filtered = filtered.filter(bp => bp.end_time >= start_date);
  if (end_date) filtered = filtered.filter(bp => bp.start_time <= end_date);
  filtered.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const enriched = filtered.map(bp => {
    const v = vehicles.find(x => x.id === bp.vehicle_id);
    return { ...bp, vehicle_name: v?.name, vehicle_code: v?.code };
  });

  const result = frequencies.map(freq => ({
    ...freq,
    plans: enriched.filter(p => p.frequency_id === freq.id)
  }));
  res.json(result);
});

module.exports = router;
