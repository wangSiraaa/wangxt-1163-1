const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, username, name, role, created_at FROM users';
  const params = [];
  if (role) {
    sql += ' WHERE role = ?';
    params.push(role);
  }
  const users = db.prepare(sql).all(...params);
  res.json(users);
});

router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json(user);
});

module.exports = router;
