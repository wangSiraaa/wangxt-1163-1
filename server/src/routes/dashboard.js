const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/summary', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const allPlans = db.prepare('SELECT * FROM broadcast_plans').all();
  const totalPlans = allPlans.length;
  const todayPlans = allPlans.filter(p => (p.start_time || '').split('T')[0] === today).length;
  const pendingPlans = allPlans.filter(p => p.status === 'pending').length;
  const ongoingPlans = allPlans.filter(p => p.status === 'ongoing').length;

  const allVehicles = db.prepare('SELECT * FROM vehicles').all();
  const totalVehicles = allVehicles.length;
  const availableVehicles = allVehicles.filter(v => v.status === 'available').length;
  const inUseVehicles = allVehicles.filter(v => v.status === 'in_use').length;
  const maintenanceVehicles = allVehicles.filter(v => v.status === 'maintenance').length;

  const allFreqs = db.prepare('SELECT * FROM frequencies').all();
  const totalFrequencies = allFreqs.length;
  const activeFreqIds = new Set(
    allPlans
      .filter(p => ['pending', 'dispatched', 'ongoing'].includes(p.status) && p.frequency_id != null)
      .map(p => p.frequency_id)
  );
  const occupiedFrequencies = activeFreqIds.size;

  const allSignals = db.prepare('SELECT * FROM signal_records').all();
  const totalSignals = allSignals.length;
  const todaySignals = allSignals.filter(s => (s.recorded_at || '').split('T')[0] === today).length;

  res.json({
    plans: {
      total: totalPlans,
      today: todayPlans,
      pending: pendingPlans,
      ongoing: ongoingPlans
    },
    vehicles: {
      total: totalVehicles,
      available: availableVehicles,
      in_use: inUseVehicles,
      maintenance: maintenanceVehicles
    },
    frequencies: {
      total: totalFrequencies,
      occupied: occupiedFrequencies,
      available: totalFrequencies - occupiedFrequencies
    },
    signals: {
      total: totalSignals,
      today: todaySignals
    }
  });
});

router.get('/timeline', (req, res) => {
  const { start_date, end_date } = req.query;
  let plans = db.prepare(`
    SELECT bp.id, bp.title, bp.location, bp.start_time, bp.end_time, bp.status,
           bp.producer_name, bp.signal_quality,
           bp.vehicle_id, bp.frequency_id
    FROM broadcast_plans bp
    WHERE bp.status != 'cancelled'
  `).all();

  if (start_date) {
    plans = plans.filter(p => p.end_time >= start_date);
  }
  if (end_date) {
    plans = plans.filter(p => p.start_time <= end_date);
  }

  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  const vMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const fMap = Object.fromEntries(freqs.map(f => [f.id, f]));

  plans = plans.map(p => ({
    ...p,
    vehicle_name: vMap[p.vehicle_id]?.name,
    vehicle_code: vMap[p.vehicle_id]?.code,
    vehicle_status: vMap[p.vehicle_id]?.status,
    frequency_code: fMap[p.frequency_id]?.code,
    frequency: fMap[p.frequency_id]?.frequency,
    band: fMap[p.frequency_id]?.band
  })).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  res.json(plans);
});

module.exports = router;
