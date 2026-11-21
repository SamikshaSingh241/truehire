const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { connectDB, disconnectDB } = require('./config/db');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Body Parsers (with rawBody capture for webhook signature verification)
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve static resume uploads
const uploadDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadDir));

// Mount API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    platform: 'TrueHire SaaS Platform API (PostgreSQL + Prisma)',
    status: 'online',
    version: '2.0.0',
    documentation: '/api/health',
    endpoints: {
      auth: '/api/auth',
      jobs: '/api/jobs',
      candidate: '/api/candidate',
      recruiter: '/api/recruiter',
      admin: '/api/admin'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// Connect PostgreSQL Database and Start Server
const startServer = async () => {
  try {
    await connectDB();
    const HOST = process.env.HOST || '0.0.0.0';
    const server = app.listen(PORT, HOST, () => {
      logger.info(`TrueHire Server listening on ${HOST}:${PORT}`, 'STARTUP', {
        port: PORT,
        host: HOST,
        env: process.env.NODE_ENV || 'development',
        database: 'PostgreSQL (Prisma ORM)'
      });
      console.log(`====================================================`);
      console.log(`🚀 TrueHire Server listening on ${HOST}:${PORT}`);
      console.log(`🐘 Database: PostgreSQL (Prisma ORM)`);
      console.log(`📡 Base API URL: http://0.0.0.0:${PORT}/api`);
      console.log(`📁 Uploads served at: http://0.0.0.0:${PORT}/uploads`);
      console.log(`====================================================`);
    });

    const shutdown = async () => {
      console.log('\n[Server] Gracefully shutting down...');
      server.close(async () => {
        await disconnectDB();
        console.log('[Server] Disconnected and exited cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`, 'STARTUP_ERROR');
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
