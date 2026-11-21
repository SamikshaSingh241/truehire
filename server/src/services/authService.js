const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const emailService = require('./emailService');
const { generateToken } = require('../utils/jwtToken');

class AuthService {
  constructor() {
    this.loginOtpMemoryStore = new Map();
    this.resetCodes = new Map();
  }

  async register({ email, password, role, name, companyName }) {
    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      throw new Error('An account with this email address already exists');
    }

    if (role === 'admin') {
      throw new Error('Admin registration is not publicly accessible');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        role
      }
    });

    if (role === 'candidate') {
      await prisma.candidateProfile.create({
        data: {
          userId: user.id,
          name: name || cleanEmail.split('@')[0],
          profileComplete: false
        }
      });
    } else if (role === 'recruiter') {
      await prisma.company.create({
        data: {
          ownerUserId: user.id,
          name: companyName || `${cleanEmail.split('@')[0]}'s Organization`,
          verificationStatus: 'pending'
        }
      });
    }

    const token = generateToken({ id: user.id, role: user.role });

    return {
      user: {
        id: user.id,
        _id: user.id,
        email: user.email,
        role: user.role
      },
      token
    };
  }

  async login({ email, password, expectedRole }) {
    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (user.isBanned) {
      throw new Error('This account has been suspended by an administrator.');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    if (expectedRole && user.role !== expectedRole) {
      if (expectedRole === 'admin') {
        throw new Error('Access denied: Authorized administrator accounts only.');
      } else if (expectedRole === 'recruiter') {
        if (user.role === 'candidate') {
          throw new Error('This account is registered as a candidate. Please use the Candidate Login.');
        } else if (user.role === 'admin') {
          throw new Error('This is an administrator account. Please use the Admin Login.');
        } else {
          throw new Error('Unauthorized role for Recruiter Login.');
        }
      } else if (expectedRole === 'candidate') {
        if (user.role === 'recruiter') {
          throw new Error('This account is registered as a recruiter. Please use the Recruiter Login.');
        } else if (user.role === 'admin') {
          throw new Error('This is an administrator account. Please use the Admin Login.');
        } else {
          throw new Error('Unauthorized role for Candidate Login.');
        }
      } else {
        throw new Error(`Unauthorized: Account role (${user.role}) does not match portal role.`);
      }
    }

    if (user.role === 'admin') {
      const token = generateToken({ id: user.id, role: user.role });
      return {
        requiresOtp: false,
        user: {
          id: user.id,
          _id: user.id,
          email: user.email,
          role: user.role
        },
        token
      };
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await prisma.loginOTP.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true }
      });
      await prisma.loginOTP.create({
        data: {
          userId: user.id,
          email: user.email,
          otpHash,
          challengeId,
          expiresAt,
          attempts: 0,
          used: false,
          lastResentAt: new Date()
        }
      });
    } catch (dbErr) {
      this.loginOtpMemoryStore.set(challengeId, {
        userId: user.id,
        email: user.email,
        otpHash,
        challengeId,
        expiresAt: expiresAt.getTime(),
        attempts: 0,
        used: false,
        lastResentAt: Date.now()
      });
    }

    let userName = user.email.split('@')[0];
    try {
      if (user.role === 'candidate') {
        const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
        if (profile?.name) userName = profile.name;
      } else if (user.role === 'recruiter') {
        const company = await prisma.company.findFirst({ where: { ownerUserId: user.id } });
        if (company?.name) userName = company.name;
      }
    } catch (e) {}

    await emailService.sendLoginOTP(user.email, rawOtp, userName);

    return {
      requiresOtp: true,
      challengeId,
      email: user.email,
      role: user.role,
      message: 'A 6-digit verification code has been dispatched to your email.'
    };
  }

  async verifyLoginOTP({ challengeId, otp }) {
    if (!challengeId || !otp) {
      throw new Error('Challenge ID and verification code are required');
    }

    let otpRecord = null;
    let isMemoryFallback = false;

    try {
      otpRecord = await prisma.loginOTP.findUnique({ where: { challengeId } });
    } catch (e) {
      otpRecord = this.loginOtpMemoryStore.get(challengeId) || null;
      isMemoryFallback = true;
    }

    if (!otpRecord && this.loginOtpMemoryStore.has(challengeId)) {
      otpRecord = this.loginOtpMemoryStore.get(challengeId);
      isMemoryFallback = true;
    }

    if (!otpRecord) {
      throw new Error('Invalid or expired login challenge. Please log in again.');
    }

    if (otpRecord.used) {
      throw new Error('This verification code has already been utilized. Please log in again.');
    }

    const expiryTime = otpRecord.expiresAt instanceof Date ? otpRecord.expiresAt.getTime() : otpRecord.expiresAt;
    if (Date.now() > expiryTime) {
      throw new Error('Verification code has expired. Please log in again.');
    }

    if (otpRecord.attempts >= 5) {
      throw new Error('Too many failed verification attempts. Please log in again.');
    }

    const isMatch = await bcrypt.compare(String(otp).trim(), otpRecord.otpHash);
    if (!isMatch) {
      const newAttempts = (otpRecord.attempts || 0) + 1;
      if (!isMemoryFallback && otpRecord.id) {
        try {
          await prisma.loginOTP.update({
            where: { id: otpRecord.id },
            data: { attempts: newAttempts }
          });
        } catch (e) {}
      } else {
        otpRecord.attempts = newAttempts;
      }
      const remaining = 5 - newAttempts;
      throw new Error(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    if (!isMemoryFallback && otpRecord.id) {
      try {
        await prisma.loginOTP.update({
          where: { id: otpRecord.id },
          data: { used: true, verifiedAt: new Date() }
        });
      } catch (e) {}
    } else {
      otpRecord.used = true;
    }

    const user = await prisma.user.findUnique({ where: { id: otpRecord.userId } });
    if (!user) {
      throw new Error('User associated with this challenge no longer exists');
    }

    const token = generateToken({ id: user.id, role: user.role });

    return {
      user: {
        id: user.id,
        _id: user.id,
        email: user.email,
        role: user.role
      },
      token
    };
  }

  async resendLoginOTP({ challengeId }) {
    if (!challengeId) {
      throw new Error('Challenge ID is required to resend code');
    }

    let otpRecord = null;
    try {
      otpRecord = await prisma.loginOTP.findUnique({ where: { challengeId } });
    } catch (e) {
      otpRecord = this.loginOtpMemoryStore.get(challengeId) || null;
    }

    if (!otpRecord && this.loginOtpMemoryStore.has(challengeId)) {
      otpRecord = this.loginOtpMemoryStore.get(challengeId);
    }

    if (!otpRecord) {
      throw new Error('Challenge record not found. Please log in again.');
    }

    const lastResent = otpRecord.lastResentAt ? new Date(otpRecord.lastResentAt).getTime() : 0;
    const cooldownMs = 45 * 1000;
    if (Date.now() - lastResent < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - (Date.now() - lastResent)) / 1000);
      throw new Error(`Please wait ${waitSeconds}s before requesting a new code.`);
    }

    const newRawOtp = crypto.randomInt(100000, 1000000).toString();
    const newChallengeId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const newOtpHash = await bcrypt.hash(newRawOtp, 10);
    const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      if (otpRecord.id) {
        await prisma.loginOTP.update({
          where: { id: otpRecord.id },
          data: { used: true }
        });
      }
      await prisma.loginOTP.create({
        data: {
          userId: otpRecord.userId,
          email: otpRecord.email,
          otpHash: newOtpHash,
          challengeId: newChallengeId,
          expiresAt: newExpiresAt,
          attempts: 0,
          used: false,
          lastResentAt: new Date()
        }
      });
    } catch (err) {
      this.loginOtpMemoryStore.set(newChallengeId, {
        userId: otpRecord.userId,
        email: otpRecord.email,
        otpHash: newOtpHash,
        challengeId: newChallengeId,
        expiresAt: newExpiresAt.getTime(),
        attempts: 0,
        used: false,
        lastResentAt: Date.now()
      });
    }

    let userName = otpRecord.email.split('@')[0];
    try {
      const user = await prisma.user.findUnique({ where: { id: otpRecord.userId } });
      if (user && user.role === 'candidate') {
        const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
        if (profile?.name) userName = profile.name;
      } else if (user && user.role === 'recruiter') {
        const company = await prisma.company.findFirst({ where: { ownerUserId: user.id } });
        if (company?.name) userName = company.name;
      }
    } catch (e) {}

    await emailService.sendLoginOTP(otpRecord.email, newRawOtp, userName);

    return {
      challengeId: newChallengeId,
      email: otpRecord.email,
      message: 'A new 6-digit verification code has been dispatched to your email.'
    };
  }

  async getCurrentUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      throw new Error('User not found');
    }

    let profileData = null;
    let companyData = null;

    if (user.role === 'candidate') {
      profileData = await prisma.candidateProfile.findUnique({ where: { userId } });
      if (profileData) profileData._id = profileData.id;
    } else if (user.role === 'recruiter') {
      companyData = await prisma.company.findFirst({ where: { ownerUserId: userId } });
      if (companyData) companyData._id = companyData.id;
    }

    return {
      ...user,
      _id: user.id,
      profile: profileData,
      company: companyData
    };
  }

  async forgotPassword({ email }) {
    if (!email) {
      throw new Error('Email address is required');
    }
    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return {
        success: true,
        message: 'If an account exists with this email address, a 6-digit reset code has been sent.'
      };
    }

    const resetCode = crypto.randomInt(100000, 1000000).toString();
    const resetHash = await bcrypt.hash(resetCode, 10);
    const expiresAt = Date.now() + 10 * 60 * 1000;

    this.resetCodes.set(cleanEmail, {
      userId: user.id,
      email: cleanEmail,
      resetHash,
      expiresAt,
      attempts: 0
    });

    let userName = cleanEmail.split('@')[0];
    if (user.role === 'candidate') {
      const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
      if (profile?.name) userName = profile.name;
    } else if (user.role === 'recruiter') {
      const company = await prisma.company.findFirst({ where: { ownerUserId: user.id } });
      if (company?.name) userName = company.name;
    }

    try {
      await emailService.sendPasswordResetEmail(cleanEmail, resetCode, userName);
    } catch (e) {
      console.warn('[AuthService] Could not send password reset email:', e.message);
    }

    return {
      success: true,
      message: 'A 6-digit password reset code has been sent to your email.'
    };
  }

  async resetPassword({ email, resetCode, newPassword }) {
    if (!email || !resetCode || !newPassword) {
      throw new Error('Email, reset code, and new password are required');
    }
    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    const cleanEmail = email.toLowerCase().trim();
    const record = this.resetCodes.get(cleanEmail);
    if (!record) {
      throw new Error('No password reset requested or reset code expired. Please request a new code.');
    }
    if (Date.now() > record.expiresAt) {
      this.resetCodes.delete(cleanEmail);
      throw new Error('Reset code has expired. Please request a new code.');
    }
    if (record.attempts >= 5) {
      this.resetCodes.delete(cleanEmail);
      throw new Error('Too many failed attempts. Please request a new code.');
    }

    const isMatch = await bcrypt.compare(String(resetCode).trim(), record.resetHash);
    if (!isMatch) {
      record.attempts += 1;
      throw new Error('Invalid verification code.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { email: cleanEmail },
      data: { passwordHash }
    });

    this.resetCodes.delete(cleanEmail);

    return {
      success: true,
      message: 'Your password has been successfully reset. You may now log in.'
    };
  }
}

module.exports = new AuthService();
