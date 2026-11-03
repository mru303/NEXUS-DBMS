export function notFoundHandler(_req, res) {
  res.status(404).json({ ok: false, error: 'Route not found' });
}

export function errorHandler(err, _req, res, _next) {
  const databaseStatuses = { '23505': 409, '23503': 409, '23514': 400, '22P02': 400, '22007': 400 };
  const status = err.statusCode || databaseStatuses[err.code] || 500;
  const message = err.code === '23505'
    ? 'A record with the same unique value already exists.'
    : err.code === '23503'
      ? 'This change conflicts with related records.'
      : err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    console.error('[server:error]', message);
  }

  res.status(status).json({
    ok: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { details: err.details || undefined }),
  });
}
