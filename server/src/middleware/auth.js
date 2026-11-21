const { verifyToken } = require('../utils/jwtToken');
const { errorResponse } = require('../utils/apiResponse');
const prisma = require('../config/prisma');

const authenticateJwt = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Authentication required. No token provided.', 401);
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyToken(token);
    } catch (err) {
      return errorResponse(res, 'Invalid or expired token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return errorResponse(res, 'User associated with this token no longer exists', 401);
    }

    if (user.isBanned) {
      return errorResponse(res, 'This account has been suspended by an administrator', 403);
    }

    // Attach user with backward-compatible _id alias
    user._id = user.id;
    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, `Authentication error: ${error.message}`, 500);
  }
};

module.exports = { authenticateJwt };
