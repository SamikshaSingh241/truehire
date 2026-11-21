const prisma = require('../config/prisma');
const subscriptionService = require('./subscriptionService');

class JobService {
  async createJob(userId, jobData) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: userId } });
    if (!company) {
      throw new Error('Please set up your company profile before posting a job');
    }

    if (company.verificationStatus !== 'valid') {
      throw new Error(`Your company verification status is ${company.verificationStatus}. Only admin-approved companies can publish jobs to the marketplace.`);
    }

    const subscription = await subscriptionService.consumeJobEntitlement(userId);
    const isFeatured = jobData.featured && subscription?.features?.featuredListing;

    let formattedSalary = jobData.salary;
    if (jobData.hideSalary) {
      formattedSalary = 'Not Disclosed';
    } else if (jobData.type === 'internship') {
      if (jobData.isPaid === false) {
        formattedSalary = 'Unpaid Internship';
      } else if (jobData.stipendMin && jobData.stipendMax) {
        formattedSalary = `₹${Number(jobData.stipendMin).toLocaleString('en-IN')} - ₹${Number(jobData.stipendMax).toLocaleString('en-IN')}/mo`;
      } else if (jobData.stipendMin) {
        formattedSalary = `₹${Number(jobData.stipendMin).toLocaleString('en-IN')}/mo`;
      }
    } else if (jobData.salaryMin && jobData.salaryMax) {
      formattedSalary = `₹${Number(jobData.salaryMin).toLocaleString('en-IN')} - ₹${Number(jobData.salaryMax).toLocaleString('en-IN')}/${jobData.salaryPeriod || 'year'}`;
    } else if (jobData.salaryMin) {
      formattedSalary = `₹${Number(jobData.salaryMin).toLocaleString('en-IN')}/${jobData.salaryPeriod || 'year'}`;
    }

    const job = await prisma.job.create({
      data: {
        title: jobData.title,
        type: jobData.type || 'internship',
        description: jobData.description,
        skills: Array.isArray(jobData.skills) ? jobData.skills : [],
        salary: formattedSalary || jobData.salary || 'Competitive',
        salaryMin: jobData.salaryMin ? Number(jobData.salaryMin) : null,
        salaryMax: jobData.salaryMax ? Number(jobData.salaryMax) : null,
        currency: jobData.currency || 'INR',
        salaryPeriod: jobData.salaryPeriod || 'yearly',
        hideSalary: !!jobData.hideSalary,
        isNegotiable: !!jobData.isNegotiable,
        isPaid: jobData.isPaid !== undefined ? !!jobData.isPaid : true,
        stipendMin: jobData.stipendMin ? Number(jobData.stipendMin) : null,
        stipendMax: jobData.stipendMax ? Number(jobData.stipendMax) : null,
        featured: !!isFeatured,
        duration: jobData.duration || 'Full-time',
        workMode: jobData.workMode || 'remote',
        location: jobData.location || 'Remote',
        deadline: jobData.deadline ? new Date(jobData.deadline) : null,
        status: jobData.status || 'published',
        companyId: company.id,
        createdById: userId
      },
      include: {
        company: true
      }
    });

    job._id = job.id;
    job.company._id = job.company.id;
    job.companyId = job.company;
    return job;
  }

  async deleteJob(userId, jobId) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job listing not found');
    }

    if (job.createdById !== userId) {
      throw new Error('Unauthorized to delete this job');
    }

    if (job.status === 'published') {
      await subscriptionService.releaseJobEntitlement(job.companyId);
    }

    await prisma.job.delete({ where: { id: jobId } });
    return { success: true, message: 'Job deleted successfully' };
  }

  async getRecruiterJobs(userId) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: userId } });
    if (!company) {
      return { jobs: [], company: null };
    }

    const jobs = await prisma.job.findMany({
      where: { companyId: company.id },
      include: { company: true },
      orderBy: { createdAt: 'desc' }
    });

    const jobIds = jobs.map((j) => j.id);
    const applications = await prisma.application.findMany({
      where: { jobId: { in: jobIds } },
      select: { jobId: true }
    });

    const jobsWithCounts = jobs.map((job) => {
      const appCount = applications.filter((a) => a.jobId === job.id).length;
      const formatted = { ...job, _id: job.id, applicationCount: appCount };
      if (formatted.company) {
        formatted.company._id = formatted.company.id;
        formatted.companyId = formatted.company;
      }
      return formatted;
    });

    company._id = company.id;
    return {
      company,
      jobs: jobsWithCounts
    };
  }

  async updateJob(userId, jobId, updateData) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error('Job listing not found');
    }

    if (job.createdById !== userId) {
      throw new Error('Unauthorized to modify this job');
    }

    const wasPublished = job.status === 'published';
    const isNowClosed = updateData.status === 'closed';

    const cleanUpdate = { ...updateData };
    if (cleanUpdate.deadline) cleanUpdate.deadline = new Date(cleanUpdate.deadline);
    if (cleanUpdate.salaryMin) cleanUpdate.salaryMin = Number(cleanUpdate.salaryMin);
    if (cleanUpdate.salaryMax) cleanUpdate.salaryMax = Number(cleanUpdate.salaryMax);
    if (cleanUpdate.stipendMin) cleanUpdate.stipendMin = Number(cleanUpdate.stipendMin);
    if (cleanUpdate.stipendMax) cleanUpdate.stipendMax = Number(cleanUpdate.stipendMax);

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: cleanUpdate,
      include: { company: true }
    });

    if (wasPublished && isNowClosed) {
      await subscriptionService.releaseJobEntitlement(job.companyId);
    }

    updatedJob._id = updatedJob.id;
    if (updatedJob.company) {
      updatedJob.company._id = updatedJob.company.id;
      updatedJob.companyId = updatedJob.company;
    }
    return updatedJob;
  }

  async getRecruiterDashboardData(userId) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: userId } });
    if (!company) {
      return {
        company: null,
        stats: {
          totalJobs: 0,
          activeJobs: 0,
          draftJobs: 0,
          closedJobs: 0,
          expiredJobs: 0,
          totalApplications: 0,
          pendingApplications: 0,
          shortlistedCount: 0,
          rejectedCount: 0,
          scheduledInterviews: 0
        },
        jobs: [],
        recentApplications: [],
        canBePublic: false,
        subscription: null
      };
    }

    company._id = company.id;
    const jobs = await prisma.job.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' }
    });

    const totalJobs = jobs.length;
    const activeJobs = jobs.filter((j) => j.status === 'published').length;
    const draftJobs = jobs.filter((j) => j.status === 'draft').length;
    const closedJobs = jobs.filter((j) => j.status === 'closed').length;
    const now = new Date();
    const expiredJobs = jobs.filter((j) => (j.deadline && new Date(j.deadline) < now) || j.status === 'closed').length;

    const jobIds = jobs.map((j) => j.id);
    const allApplications = await prisma.application.findMany({
      where: { jobId: { in: jobIds } }
    });

    const totalApplications = allApplications.length;
    const pendingApplications = allApplications.filter((a) => a.status === 'applied' || a.status === 'under_review').length;
    const shortlistedCount = allApplications.filter((a) => a.status === 'shortlisted').length;
    const rejectedCount = allApplications.filter((a) => a.status === 'rejected').length;
    const scheduledInterviews = allApplications.filter((a) => a.status === 'accepted').length;

    const recentApplications = await prisma.application.findMany({
      where: { jobId: { in: jobIds } },
      include: {
        candidate: { select: { email: true } },
        job: { select: { title: true, type: true } }
      },
      orderBy: { appliedAt: 'desc' },
      take: 10
    });

    const formattedRecentApplications = recentApplications.map((a) => {
      const app = { ...a, _id: a.id };
      if (app.candidate) {
        app.candidateId = { email: app.candidate.email };
      }
      if (app.job) {
        app.jobId = { title: app.job.title, type: app.job.type };
      }
      return app;
    });

    const jobsWithCounts = jobs.map((job) => {
      const appCount = allApplications.filter((a) => a.jobId === job.id).length;
      return {
        ...job,
        _id: job.id,
        applicationCount: appCount,
        viewsCount: job.viewsCount || 0
      };
    });

    const activeSubscription = await subscriptionService.getActiveSubscription(userId);

    return {
      company,
      stats: {
        totalJobs,
        activeJobs,
        draftJobs,
        closedJobs,
        expiredJobs,
        totalApplications,
        pendingApplications,
        shortlistedCount,
        rejectedCount,
        scheduledInterviews
      },
      jobs: jobsWithCounts,
      recentApplications: formattedRecentApplications,
      canBePublic: company.verificationStatus === 'valid',
      subscription: activeSubscription
    };
  }

  async getPublicJobs({ search, location, skills, workMode, type, limit = 20, page = 1 }) {
    const validCompanies = await prisma.company.findMany({
      where: { verificationStatus: 'valid' },
      select: { id: true }
    });
    const validCompanyIds = validCompanies.map((c) => c.id);

    const where = {
      companyId: { in: validCompanyIds },
      status: 'published'
    };

    if (type && type !== 'all') {
      where.type = type;
    }

    if (workMode && workMode !== 'all') {
      where.workMode = workMode;
    }

    if (location && location.trim() !== '') {
      where.location = { contains: location.trim(), mode: 'insensitive' };
    }

    if (search && search.trim() !== '') {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } }
      ];
    }

    if (skills) {
      const skillsArray = Array.isArray(skills)
        ? skills
        : skills.split(',').map((s) => s.trim()).filter(Boolean);

      if (skillsArray.length > 0) {
        where.skills = { hasSome: skillsArray };
      }
    }

    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              website: true,
              industry: true,
              size: true,
              location: true,
              logoUrl: true,
              verificationStatus: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.job.count({ where })
    ]);

    const formattedJobs = jobs.map((job) => {
      const j = { ...job, _id: job.id };
      if (j.company) {
        j.company._id = j.company.id;
        j.companyId = j.company;
      }
      return j;
    });

    return {
      jobs: formattedJobs,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / take)
    };
  }

  async getJobById(jobId, currentUser = null) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true }
    });

    if (!job) {
      throw new Error('Job listing not found');
    }

    const isCompanyValid = job.company && job.company.verificationStatus === 'valid';
    const isOwner =
      currentUser &&
      (job.createdById === currentUser.id || currentUser.role === 'admin');

    if (!isCompanyValid && !isOwner) {
      throw new Error('This job listing is currently under administrative company verification and is not publicly visible');
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { viewsCount: { increment: 1 } }
    });

    job.viewsCount = (job.viewsCount || 0) + 1;
    job._id = job.id;
    if (job.company) {
      job.company._id = job.company.id;
      job.companyId = job.company;
    }

    return job;
  }
}

module.exports = new JobService();
