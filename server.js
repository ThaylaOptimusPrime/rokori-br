const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'applications.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function readApplications() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function saveApplications(applications) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2));
}
function auth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Não autorizado.' });
  next();
}

app.post('/api/applications', (req, res) => {
  const required = ['nick','discord','age','time','experience','why','conflict','friend','choose','availability','rules'];
  const missing = required.filter(k => !String(req.body[k] ?? '').trim());
  if (missing.length) return res.status(400).json({ error: 'Preencha todos os campos.', missing });

  const application = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    ...Object.fromEntries(required.map(k => [k, String(req.body[k]).trim()])),
    status: 'Pendente',
    submittedAt: new Date().toISOString()
  };

  const applications = readApplications();
  applications.unshift(application);
  saveApplications(applications);
  res.status(201).json({ ok: true, id: application.id });
});

app.get('/api/applications', auth, (req, res) => {
  res.json(readApplications());
});

app.patch('/api/applications/:id', auth, (req, res) => {
  const allowed = ['Pendente', 'Aprovada', 'Recusada'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const applications = readApplications();
  const item = applications.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  item.status = req.body.status;
  saveApplications(applications);
  res.json({ ok: true, application: item });
});

app.delete('/api/applications/:id', auth, (req, res) => {
  const applications = readApplications();
  const filtered = applications.filter(a => a.id !== req.params.id);
  if (filtered.length === applications.length) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  saveApplications(filtered);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Rokori BR rodando na porta ${PORT}`));
