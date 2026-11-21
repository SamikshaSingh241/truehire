const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { verifyToken } = require('../utils/jwtToken');
const { authenticateJwt } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { jobValidation } = require('../validations/jobValidation');
const { validate } = require('../middleware/validate');
const prisma = require('../config/prisma');

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true }
      });
      if (user) {
        user._id = user.id;
        req.user = user;
      }
    }
  } catch (e) {
    // Ignore invalid token in optional auth
  }
  next();
};

// Public Job Search and Discovery
router.get('/', jobController.getPublicJobs);

// Recruiter Job Management (Must be before /:id)
router.get('/mine', authenticateJwt, requireRole('recruiter'), jobController.getRecruiterJobs);
router.post('/', authenticateJwt, requireRole('recruiter'), jobValidation, validate, jobController.createJob);
router.patch('/:id', authenticateJwt, requireRole('recruiter'), jobController.updateJob);
router.delete('/:id', authenticateJwt, requireRole('recruiter'), jobController.deleteJob);

// Public / Authenticated Job Detail
router.get('/:id', optionalAuth, jobController.getJobById);

module.exports = router;
