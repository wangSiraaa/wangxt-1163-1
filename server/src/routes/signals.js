const express = require('express');
const db = require('../db');

const router = express.Router();

function sameId(a, b) {
  if (a == null || b == null) return a === b;
  return String(a) === String(b);
}

router.post('/', (req, res) => {
  const { plan_id, engineer_id, engineer_name, signal_strength, signal_quality, audio_status, video_status, note, recorded_at, frequency_id } = req.body;
  if (!plan_id || !engineer_id || !engineer_name || signal_strength == null || !signal_quality) {
    return res.status(400).json({ error: '计划ID、工程师信息、信号强度和质量不能为空' });
  }
  if (!['excellent', 'good', 'fair', 'poor'].includes(signal_quality)) {
    return res.status(400).json({ error: '无效的信号质量等级' });
  }
  if (audio_status && !['normal', 'abnormal', 'none'].includes(audio_status)) {
    return res.status(400).json({ error: '无效的音频状态' });
  }
  if (video_status && !['normal', 'abnormal', 'none'].includes(video_status)) {
    return res.status(400).json({ error: '无效的视频状态' });
  }

  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(404).json({ error: '直播计划不存在' });
  }
  if (plan.status === 'cancelled') {
    return res.status(400).json({ error: '已取消的直播计划不能记录信号' });
  }
  if (plan.status === 'ended') {
    return res.status(400).json({
      error: '直播已结束，信号记录只读，不能新增记录',
      code: 'RECORD_READ_ONLY'
    });
  }

  const recordFrequencyId = frequency_id || plan.frequency_id;
  const info = db.prepare(`
    INSERT INTO signal_records (plan_id, engineer_id, engineer_name, signal_strength, signal_quality, audio_status, video_status, note, recorded_at, frequency_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    plan_id, engineer_id, engineer_name, signal_strength, signal_quality,
    audio_status || 'normal', video_status || 'normal', note || '',
    recorded_at || new Date().toISOString(), recordFrequencyId
  );

  if (signal_quality) {
    const data = db._data;
    const idx = data.broadcast_plans.findIndex(p => p.id == plan_id);
    if (idx >= 0) {
      data.broadcast_plans[idx] = { ...data.broadcast_plans[idx], signal_quality };
      db._data = data;
    }
  }

  const record = db._data.signal_records.find(r => r.id === info.lastInsertRowid);
  res.status(201).json(record);
});

router.get('/', (req, res) => {
  const { plan_id, engineer_id, start_date, end_date } = req.query;
  let records = db.prepare('SELECT * FROM signal_records').all();
  if (plan_id) records = records.filter(r => r.plan_id == plan_id);
  if (engineer_id) records = records.filter(r => r.engineer_id == engineer_id);
  if (start_date) records = records.filter(r => r.recorded_at >= start_date);
  if (end_date) records = records.filter(r => r.recorded_at <= end_date);
  records.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));

  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();

  const result = records.map(sr => {
    const bp = plans.find(p => sameId(p.id, sr.plan_id));
    const v = vehicles.find(x => sameId(x.id, bp?.vehicle_id));
    const recordFreqId = sr.frequency_id || bp?.frequency_id;
    const f = freqs.find(x => sameId(x.id, recordFreqId));
    const isReadOnly = bp?.status === 'ended';
    return {
      ...sr,
      plan_title: bp?.title, location: bp?.location, city: bp?.city,
      plan_start: bp?.start_time, plan_end: bp?.end_time,
      plan_status: bp?.status,
      vehicle_name: v?.name, vehicle_code: v?.code,
      frequency_code: f?.code, frequency: f?.frequency,
      is_read_only: isReadOnly
    };
  });
  res.json(result);
});

router.get('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM signal_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '信号记录不存在' });
  }
  const plans = db.prepare('SELECT * FROM broadcast_plans').all();
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const freqs = db.prepare('SELECT * FROM frequencies').all();
  const bp = plans.find(p => sameId(p.id, record.plan_id));
  const v = vehicles.find(x => sameId(x.id, bp?.vehicle_id));
  const recordFreqId = record.frequency_id || bp?.frequency_id;
  const f = freqs.find(x => sameId(x.id, recordFreqId));
  const isReadOnly = bp?.status === 'ended';
  res.json({
    ...record,
    plan_title: bp?.title, location: bp?.location, city: bp?.city,
    plan_start: bp?.start_time, plan_end: bp?.end_time,
    plan_status: bp?.status,
    vehicle_name: v?.name, vehicle_code: v?.code,
    frequency_code: f?.code, frequency: f?.frequency,
    is_read_only: isReadOnly
  });
});

router.delete('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM signal_records WHERE id = ?').get(req.params.id);
  if (!record) {
    return res.status(404).json({ error: '信号记录不存在' });
  }
  const plan = db.prepare('SELECT * FROM broadcast_plans WHERE id = ?').get(record.plan_id);
  if (plan && plan.status === 'ended') {
    return res.status(400).json({
      error: '直播已结束，信号记录不能撤回',
      code: 'RECORD_NOT_REVOCABLE'
    });
  }
  const data = db._data;
  data.signal_records = data.signal_records.filter(r => r.id != req.params.id);
  db._data = data;
  res.json({ message: '信号记录已删除', id: req.params.id });
});

module.exports = router;
