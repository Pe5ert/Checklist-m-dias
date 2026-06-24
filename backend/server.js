const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());

// ─── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Init DB ──────────────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cultos (
        id          BIGSERIAL PRIMARY KEY,
        data_culto  TEXT         NOT NULL,
        tipo_culto  TEXT         NOT NULL,
        equipe      TEXT[]       NOT NULL DEFAULT '{}',
        itens       JSONB        NOT NULL DEFAULT '[]',
        done_count  INT          NOT NULL DEFAULT 0,
        total_itens INT          NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ DB pronto');
  } finally {
    client.release();
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_, res) => res.json({ ok: true }));

// GET /cultos — lista todos os cultos (resumo)
app.get('/cultos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, data_culto, tipo_culto, equipe, done_count, total_itens, created_at
       FROM cultos
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar cultos' });
  }
});

// GET /cultos/:id — detalhe completo de um culto
app.get('/cultos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const { rows: [culto] } = await pool.query(
      `SELECT * FROM cultos WHERE id = $1`, [id]
    );
    if (!culto) return res.status(404).json({ error: 'Culto não encontrado' });

    res.json(culto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar culto' });
  }
});

// POST /cultos — salva um novo culto
app.post('/cultos', async (req, res) => {
  const { data_culto, tipo_culto, equipe, itens, done_count, total_itens } = req.body;

  if (!data_culto || !tipo_culto) {
    return res.status(400).json({ error: 'data_culto e tipo_culto são obrigatórios' });
  }
  if (!Array.isArray(itens)) {
    return res.status(400).json({ error: 'itens deve ser um array' });
  }

  try {
    const { rows: [culto] } = await pool.query(
      `INSERT INTO cultos (data_culto, tipo_culto, equipe, itens, done_count, total_itens)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data_culto,
        tipo_culto,
        equipe || [],
        JSON.stringify(itens),
        done_count || 0,
        total_itens || itens.length,
      ]
    );
    res.status(201).json(culto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar culto' });
  }
});

// DELETE /cultos/:id — apaga um culto
app.delete('/cultos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    await pool.query('DELETE FROM cultos WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar culto' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`)))
  .catch(err => { console.error('Falha ao iniciar DB:', err); process.exit(1); });