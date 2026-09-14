export function errorHandler(err, req, res, next) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Conflict: duplicate entry' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
