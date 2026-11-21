const prisma = require('../config/prisma');

class AdminService {
  async getCompanies(statusFilter = null) {
    const where = {};
    if (statusFilter && ['pending', 'valid', 'invalid'].includes(statusFilter)) {
      where.verificationStatus = statusFilter;
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        owner: { select: { id: true, email: true, createdAt: true } },
        reviewedBy: { select: { id: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const companyIds = companies.map((c) => c.id);
    const jobs = await prisma.job.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true, companyId: true, status: true, title: true, type: true, createdAt: true }
    });

    const companiesWithDetails = companies.map((company) => {
      const companyJobs = jobs.filter((j) => j.companyId === company.id);
      const c = { ...company, _id: company.id };
      if (c.owner) {
        c.ownerUserId = { ...c.owner, _id: c.owner.id };
      }
      if (c.reviewedBy) {
        c.reviewedBy = { ...c.reviewedBy, _id: c.reviewedBy.id };
      }
      c.jobsCount = companyJobs.length;
      c.publishedJobsCount = companyJobs.filter((j) => j.status === 'published').length;
      c.jobs = companyJobs.map((j) => ({ ...j, _id: j.id }));
      return c;
    });

    return companiesWithDetails;
  }

  async verifyCompany(adminUserId, companyId, { status, adminNote = '' }) {
    if (!['valid', 'invalid'].includes(status)) {
      throw new Error('Verification status must be either "valid" or "invalid"');
    }

    if (status === 'invalid' && (!adminNote || adminNote.trim() === '')) {
      throw new Error('Admin note is mandatory when rejecting or marking a company invalid');
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new Error('Company not found');
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        verificationStatus: status,
        adminNote: adminNote || (status === 'valid' ? 'Company verified by Platform Trust & Safety team' : ''),
        reviewedById: adminUserId,
        reviewedAt: new Date()
      },
      include: {
        owner: { select: { id: true, email: true, createdAt: true } },
        reviewedBy: { select: { id: true, email: true } }
      }
    });

    updated._id = updated.id;
    if (updated.owner) updated.ownerUserId = { ...updated.owner, _id: updated.owner.id };
    if (updated.reviewedBy) updated.reviewedBy = { ...updated.reviewedBy, _id: updated.reviewedBy.id };
    return updated;
  }

  async getAdminDashboardMetrics() {
    const [pendingCount, validCount, invalidCount, totalJobs, totalUsers] = await Promise.all([
      prisma.company.count({ where: { verificationStatus: 'pending' } }),
      prisma.company.count({ where: { verificationStatus: 'valid' } }),
      prisma.company.count({ where: { verificationStatus: 'invalid' } }),
      prisma.job.count(),
      prisma.user.count()
    ]);

    const auditLogs = await prisma.company.findMany({
      where: { reviewedAt: { not: null } },
      include: {
        owner: { select: { id: true, email: true } },
        reviewedBy: { select: { id: true, email: true } }
      },
      orderBy: { reviewedAt: 'desc' },
      take: 10
    });

    const formattedAuditLogs = auditLogs.map((log) => {
      const l = { ...log, _id: log.id };
      if (l.owner) l.ownerUserId = { ...l.owner, _id: l.owner.id };
      if (l.reviewedBy) l.reviewedBy = { ...l.reviewedBy, _id: l.reviewedBy.id };
      return l;
    });

    return {
      stats: {
        pendingCount,
        validCount,
        invalidCount,
        totalCompanies: pendingCount + validCount + invalidCount,
        totalJobs,
        totalUsers
      },
      auditLogs: formattedAuditLogs
    };
  }

  async getUsers(roleFilter = null, searchQuery = '') {
    const where = {};
    if (roleFilter && ['candidate', 'recruiter', 'admin'].includes(roleFilter)) {
      where.role = roleFilter;
    }
    if (searchQuery && searchQuery.trim()) {
      where.email = { contains: searchQuery.trim(), mode: 'insensitive' };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return users.map((u) => ({ ...u, _id: u.id }));
  }

  async updateUserStatus(userId, { isActive, isBanned }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const data = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (isBanned !== undefined) data.isBanned = isBanned;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
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

    return { ...updated, _id: updated.id };
  }

  async getAllJobs(statusFilter = null, searchQuery = '') {
    const where = {};
    if (statusFilter && ['published', 'draft', 'closed'].includes(statusFilter)) {
      where.status = statusFilter;
    }
    if (searchQuery && searchQuery.trim()) {
      where.title = { contains: searchQuery.trim(), mode: 'insensitive' };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, verificationStatus: true, location: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return jobs.map((job) => {
      const j = { ...job, _id: job.id };
      if (j.company) {
        j.company._id = j.company.id;
        j.companyId = j.company;
      }
      return j;
    });
  }

  async moderateJob(jobId, status) {
    if (!['published', 'draft', 'closed'].includes(status)) {
      throw new Error('Invalid status for moderation');
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job opening not found');
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status }
    });

    return { ...updated, _id: updated.id };
  }
}

module.exports = new AdminService();
