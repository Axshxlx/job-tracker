import 'dotenv/config';
import express from 'express';
import { pool } from './db.js';
import { applicationSchema, patchSchema } from './zod-validation.js'
import { asyncHandler } from './asyncHandler.js';
import { NotFoundError } from './errors.js';
import { errorHandler } from './errorHandler.js';

const app = express();
app.use(express.json());

app.post('/applications', asyncHandler(async (req, res) => {
  const validation = applicationSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }
  const { company, role, status, date_applied, source, source_url, notes } = validation.data;

  const result = await pool.query(
    `INSERT INTO applications (company, role, status, date_applied, source, source_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [company, role, status, date_applied, source, source_url, notes]
  );
  res.status(201).json(result.rows[0]);
}));

app.get('/applications', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM applications ORDER BY created_at DESC');
  res.json(result.rows);
}));

app.get('/applications/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);

  if (result.rows.length === 0) throw new NotFoundError('Application');

  res.json(result.rows[0]);
}));

app.delete('/applications/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('DELETE FROM applications WHERE id = $1 RETURNING *', [id]);

  if (result.rows.length === 0) throw new NotFoundError('Application');

  res.json({ deleted: result.rows[0] });
}));

app.patch('/applications/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const validation = patchSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }
  const fields = validation.data;

  const fieldsToUpdate = Object.keys(fields);
  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided to update' });
  }

  const setClauses = fieldsToUpdate.map((field, i) => `${field} = $${i + 1}`);
  const values = fieldsToUpdate.map(field => fields[field]);
  values.push(id);

  const query = `
    UPDATE applications
    SET ${setClauses.join(', ')}
    WHERE id = $${values.length}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) throw new NotFoundError('Application');

  res.status(200).json(result.rows[0]);
}));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

app.listen(3000, () => console.log('Server running on port 3000'));
