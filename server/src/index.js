const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 19463;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

const usersRouter = require('./routes/users');
const vehiclesRouter = require('./routes/vehicles');
const frequenciesRouter = require('./routes/frequencies');
const plansRouter = require('./routes/plans');
const dispatchesRouter = require('./routes/dispatches');
const signalsRouter = require('./routes/signals');
const dashboardRouter = require('./routes/dashboard');
const frequencySwitchRouter = require('./routes/frequency_switch_records');

app.use('/api/users', usersRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/frequencies', frequenciesRouter);
app.use('/api/plans', plansRouter);
app.use('/api/dispatches', dispatchesRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/frequency-switches', frequencySwitchRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    code: err.code || 'UNKNOWN_ERROR'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`直播车频率协调系统后端服务启动在端口 ${PORT}`);
});

module.exports = app;
