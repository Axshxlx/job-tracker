import 'dotenv/config';
import express from 'express';
import { pool } from './db.js';

const app = express();
app.use(express.json());

app.post('/applications', async (req, res) => {
  const { company, role, notes, source, source_url } = req.body;
  const status = req.body.status ?? 'applied';
  const date_applied = req.body.date_applied ?? new Date().toISOString().slice(0, 10);

  try {
    const result = await pool.query(
      `INSERT INTO applications (company, role, status, date_applied, source, source_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [company, role, status, date_applied, source, source_url, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

app.get('/applications', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM applications ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

app.get('/applications/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

app.delete('/applications/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM applications WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});


app.patch('/applications/:id', async (req, res) => {
  const { id } = req.params;
  const allowedFields = ['company', 'role', 'status', 'date_applied', 'source', 'source_url', 'notes'];
  const fieldsToUpdate = Object.keys(req.body).filter(key => allowedFields.includes(key));

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided to update' });
  }

  const setClauses = fieldsToUpdate.map((field, i) => `${field} = $${i + 1}`);
  const values = fieldsToUpdate.map(field => req.body[field]);
  values.push(id);

  const query = `
    UPDATE applications
    SET ${setClauses.join(', ')}
    WHERE id = $${values.length}
    RETURNING *
  `;

  try {
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
