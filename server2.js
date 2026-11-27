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
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveApplications(applications) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2));
}

function auth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Impede duas aprovações de cargo de acontecerem ao mesmo tempo.
let discordRoleQueue = Promise.resolve();

function queueDiscordRole(task) {
  const run = discordRoleQueue.then(task, task);
  discordRoleQueue = run.catch(() => {});
  return run;
}

async function giveDiscordRole(discordId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = process.env.DISCORD_ADMIN_ROLE_ID;

  if (!token || !guildId || !roleId) {
    throw new Error('Configuração do bot incompleta no Render.');
  }

  const url =
    `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`;

  // O Discord pode mandar um retry_after maior que 60s.
  // Não cortamos mais esse tempo, para evitar repetir a requisição enquanto
  // o rate limit ainda está ativo.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`
      }
    });

    if (response.ok || response.status === 204) {
      console.log(`Cargo entregue no Discord para ${discordId}.`);
      return;
    }

    const details = await response.text();

    if (response.status === 429 && attempt < 5) {
      let retryMs = 5000;

      try {
        const data = JSON.parse(details);
        if (typeof data.retry_after === 'number') {
          retryMs = Math.ceil(data.retry_after * 1000);
        }
      } catch {}

      const retryHeader = response.headers.get('retry-after');
      if (retryHeader) {
        const headerMs = Math.ceil(Number(retryHeader) * 1000);
        if (Number.isFinite(headerMs)) {
          retryMs = Math.max(retryMs, headerMs);
        }
      }

      retryMs = Math.max(retryMs, 1000);

      console.log(
        `Discord respondeu 429. Tentativa ${attempt}/5. Aguardando ${retryMs}ms...`
      );

      await wait(retryMs);
      continue;
    }

    throw new Error(
      `Discord recusou a entrega do cargo (HTTP ${response.status}). ${details.slice(0, 300)}`
    );
  }
}


async function sendDiscordApplication(application) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.CANDIDATURAS_CHANNEL_ID;

  if (!token || !channelId) {
    throw new Error('DISCORD_BOT_TOKEN ou CANDIDATURAS_CHANNEL_ID não configurado.');
  }

  const fields = [
    { name: '👤 Nick', value: application.nick || '-', inline: true },
    { name: '💬 Discord', value: application.discord || '-', inline: true },
    { name: '🆔 Discord ID', value: application.discordId || '-', inline: true },
    { name: '🎂 Idade', value: application.age || '-', inline: true },
    { name: '⏱️ Tempo disponível', value: application.time || '-', inline: true },
    { name: '📚 Experiência', value: application.experience || '-', inline: false },
    { name: '❓ Por que quer entrar?', value: application.why || '-', inline: false },
    { name: '⚔️ Conflitos', value: application.conflict || '-', inline: false },
    { name: '👥 Indicação/amigo', value: application.friend || '-', inline: false },
    { name: '🎯 Escolha', value: application.choose || '-', inline: false },
    { name: '📅 Disponibilidade', value: application.availability || '-', inline: false },
    { name: '📜 Regras', value: application.rules || '-', inline: false }
  ];

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [{
          title: '📩 Nova candidatura — Site',
          description: `**ID da candidatura:** \`${application.id}\``,
          color: 0x39ff14,
          fields,
          footer: { text: 'Rokori BR • Candidatura pelo site' },
          timestamp: application.submittedAt
        }]
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Discord recusou a candidatura (HTTP ${response.status}). ${details.slice(0, 300)}`
    );
  }
}

app.post('/api/applications', async (req, res) => {
  const required = [
    'nick', 'discord', 'discordId', 'age', 'time', 'experience',
    'why', 'conflict', 'friend', 'choose', 'availability', 'rules'
  ];

  const missing = required.filter(k => !String(req.body[k] ?? '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'Preencha todos os campos.', missing });
  }

  const discordId = String(req.body.discordId).trim();
  if (!/^[0-9]{17,20}$/.test(discordId)) {
    return res.status(400).json({ error: 'O ID do Discord precisa ter de 17 a 20 números.' });
  }

  const application = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    ...Object.fromEntries(required.map(k => [k, String(req.body[k]).trim()])),
    status: 'Pendente',
    submittedAt: new Date().toISOString()
  };

  const applications = readApplications();
  applications.unshift(application);
  saveApplications(applications);

  try {
    await sendDiscordApplication(application);
    console.log(`Candidatura ${application.id} enviada ao Discord.`);
  } catch (error) {
    console.error('Erro ao enviar candidatura ao Discord:', error.message);
    return res.status(502).json({
      error: 'A candidatura foi salva, mas não foi possível enviá-la ao Discord.',
      details: error.message
    });
  }

  res.status(201).json({ ok: true, id: application.id });
});


// Recebe candidaturas enviadas pelo bot do Discord.
app.post('/api/applications/from-discord', (req, res) => {
  const required = [
    'nick', 'discord', 'discordId', 'age', 'time', 'experience',
    'why', 'conflict', 'friend', 'choose', 'availability', 'rules'
  ];

  const missing = required.filter(k => !String(req.body[k] ?? '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'Preencha todos os campos.', missing });
  }

  const discordId = String(req.body.discordId).trim();
  if (!/^[0-9]{17,20}$/.test(discordId)) {
    return res.status(400).json({ error: 'O ID do Discord precisa ter de 17 a 20 números.' });
  }

  const application = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    ...Object.fromEntries(required.map(k => [k, String(req.body[k]).trim()])),
    status: 'Pendente',
    submittedAt: new Date().toISOString(),
    source: 'Discord'
  };

  const applications = readApplications();
  applications.unshift(application);
  saveApplications(applications);

  console.log(`Candidatura ${application.id} recebida do Discord e salva no painel.`);
  res.status(201).json({ ok: true, id: application.id });
});

app.get('/api/applications', auth, (req, res) => {
  res.json(readApplications());
});

app.patch('/api/applications/:id', auth, async (req, res) => {
  const allowed = ['Pendente', 'Aprovada', 'Recusada'];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const applications = readApplications();
  const item = applications.find(a => a.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Candidatura não encontrada.' });
  }

  if (req.body.status === 'Aprovada') {
    if (item.status === 'Aprovada') {
      return res.json({ ok: true, application: item });
    }

    if (!item.discordId || !/^[0-9]{17,20}$/.test(String(item.discordId))) {
      return res.status(400).json({
        error: 'Esta candidatura não tem um ID numérico válido do Discord. A pessoa precisa enviar uma nova candidatura com o ID.'
      });
    }

    try {
      await queueDiscordRole(() => giveDiscordRole(String(item.discordId)));
    } catch (error) {
      console.error('Erro ao entregar cargo do Discord:', error.message);
      return res.status(502).json({ error: error.message || 'Não foi possível entregar o cargo no Discord.' });
    }
  }

  item.status = req.body.status;
  saveApplications(applications);
  return res.json({ ok: true, application: item });
});

app.delete('/api/applications/:id', auth, (req, res) => {
  const applications = readApplications();
  const filtered = applications.filter(a => a.id !== req.params.id);

  if (filtered.length === applications.length) {
    return res.status(404).json({ error: 'Candidatura não encontrada.' });
  }

  saveApplications(filtered);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rokori BR rodando na porta ${PORT}`);
});
