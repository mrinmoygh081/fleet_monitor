
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  
  
  
  
  if (statusCode >= 500) {
    console.error(err);
  } else {
    console.warn(`[${statusCode}] ${req.method} ${req.originalUrl} — ${err.message}`);
  }
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
}

module.exports = errorHandler;
