const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { verifyToken } = require('../utils/jwtToken');
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

router.get('/', jobController.getPublicJobs);
router.get('/:id', optionalAuth, jobController.getJobById);

module.exports = router;
