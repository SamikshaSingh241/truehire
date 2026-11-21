const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const emailService = require('./emailService');

function calculateCompleteness(profile) {
  let score = 0;
  if (profile.name && profile.name.trim().length > 0) score += 15;
  if (profile.headline && profile.headline.trim().length > 0) score += 15;

  const edu = Array.isArray(profile.education) ? profile.education : [];
  if (edu.length > 0 && edu[0].college) score += 20;

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length > 0) score += 20;

  const exp = Array.isArray(profile.experience) ? profile.experience : [];
  if (exp.length > 0) score += 10;

  if (profile.resumeUrl) score += 20;
  return Math.min(100, score);
}

class CandidateService {
  async getProfile(userId) {
    let profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.candidateProfile.create({
        data: {
          userId,
          name: 'New Candidate',
          profileComplete: false
        }
      });
    }

    profile._id = profile.id;
    const completeness = calculateCompleteness(profile);
    return { profile, completeness };
  }

  async updateProfile(userId, profileData) {
    let profile = await prisma.candidateProfile.findUnique({ where: { userId } });

    const merged = { ...(profile || {}), ...profileData };
    const completeness = calculateCompleteness(merged);
    const isComplete = completeness >= 70;

    const dataToSave = {
      ...profileData,
      profileComplete: isComplete
    };

    if (profile) {
      profile = await prisma.candidateProfile.update({
        where: { userId },
        data: dataToSave
      });
    } else {
      profile = await prisma.candidateProfile.create({
        data: {
          userId,
          ...dataToSave
        }
      });
    }

    profile._id = profile.id;
    return { profile, completeness };
  }

  async updateResume(userId, file, fileUrl) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new Error('Candidate profile not found');
    }

    if (profile.resumeUrl) {
      try {
        const oldFilename = profile.resumeUrl.replace(/^\/uploads\//, '');
        const oldFilePath = path.join(__dirname, '../../uploads', oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {
        console.warn('[CandidateService] Failed to remove previous resume file:', err.message);
      }
    }

    const merged = {
      ...profile,
      resumeUrl: fileUrl,
      resumeOriginalName: file.originalname,
      resumeSize: file.size || 0,
      resumeMimeType: file.mimetype || ''
    };
    const completeness = calculateCompleteness(merged);

    const updated = await prisma.candidateProfile.update({
      where: { userId },
      data: {
        resumeUrl: fileUrl,
        resumeOriginalName: file.originalname,
        resumeSize: file.size || 0,
        resumeMimeType: file.mimetype || '',
        profileComplete: completeness >= 70
      }
    });

    updated._id = updated.id;
    return {
      profile: updated,
      completeness,
      resumeUrl: fileUrl,
      resumeOriginalName: file.originalname,
      resumeSize: file.size
    };
  }

  async deleteResume(userId) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new Error('Candidate profile not found');
    }

    if (profile.resumeUrl) {
      try {
        const filename = profile.resumeUrl.replace(/^\/uploads\//, '');
        const filePath = path.join(__dirname, '../../uploads', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn('[CandidateService] Failed to delete resume file from disk:', err.message);
      }
    }

    const merged = { ...profile, resumeUrl: null, resumeOriginalName: null, resumeSize: 0, resumeMimeType: null };
    const completeness = calculateCompleteness(merged);

    const updated = await prisma.candidateProfile.update({
      where: { userId },
      data: {
        resumeUrl: null,
        resumeOriginalName: null,
        resumeSize: 0,
        resumeMimeType: null,
        profileComplete: completeness >= 70
      }
    });

    updated._id = updated.id;
    return { profile: updated, completeness };
  }

  async saveJob(userId, jobId) {
    let profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.candidateProfile.create({ data: { userId, name: 'Candidate' } });
    }

    const existing = await prisma.savedJob.findUnique({
      where: {
        candidateProfileId_jobId: {
          candidateProfileId: profile.id,
          jobId
        }
      }
    });

    if (!existing) {
      await prisma.savedJob.create({
        data: {
          candidateProfileId: profile.id,
          jobId
        }
      });
    }

    const saved = await prisma.savedJob.findMany({
      where: { candidateProfileId: profile.id },
      select: { jobId: true }
    });

    return saved.map((s) => s.jobId);
  }

  async unsaveJob(userId, jobId) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) return [];

    await prisma.savedJob.deleteMany({
      where: {
        candidateProfileId: profile.id,
        jobId
      }
    });

    const saved = await prisma.savedJob.findMany({
      where: { candidateProfileId: profile.id },
      select: { jobId: true }
    });

    return saved.map((s) => s.jobId);
  }

  async getSavedJobs(userId) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    if (!profile) return [];

    const savedEntries = await prisma.savedJob.findMany({
      where: { candidateProfileId: profile.id },
      include: {
        job: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                website: true,
                verificationStatus: true,
                location: true,
                logoUrl: true
              }
            }
          }
        }
      },
      orderBy: { savedAt: 'desc' }
    });

    return savedEntries.map((e) => {
      const j = e.job;
      j._id = j.id;
      if (j.company) {
        j.company._id = j.company.id;
        j.companyId = j.company;
      }
      return j;
    });
  }

  async getDashboardData(userId) {
    const { profile, completeness } = await this.getProfile(userId);

    const applications = await prisma.application.findMany({
      where: { candidateId: userId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            duration: true,
            workMode: true,
            salary: true,
            location: true,
            status: true
          }
        },
        company: {
          select: {
            id: true,
            name: true,
            website: true,
            verificationStatus: true,
            location: true,
            logoUrl: true
          }
        }
      },
      orderBy: { appliedAt: 'desc' }
    });

    const formattedApplications = applications.map((a) => {
      const app = { ...a, _id: a.id };
      if (app.job) {
        app.job._id = app.job.id;
        app.jobId = app.job;
      }
      if (app.company) {
        app.company._id = app.company.id;
        app.companyId = app.company;
      }
      return app;
    });

    const verifiedCompanies = await prisma.company.findMany({
      where: { verificationStatus: 'valid' },
      select: { id: true }
    });
    const verifiedCompanyIds = verifiedCompanies.map((c) => c.id);

    const userSkills = profile.skills || [];
    let recommendedQuery = {
      companyId: { in: verifiedCompanyIds },
      status: 'published'
    };

    if (userSkills.length > 0) {
      recommendedQuery.skills = { hasSome: userSkills };
    }

    let recommendedJobs = await prisma.job.findMany({
      where: recommendedQuery,
      include: {
        company: {
          select: { id: true, name: true, website: true, verificationStatus: true, location: true, logoUrl: true }
        }
      },
      take: 6,
      orderBy: { createdAt: 'desc' }
    });

    if (recommendedJobs.length < 3) {
      recommendedJobs = await prisma.job.findMany({
        where: {
          companyId: { in: verifiedCompanyIds },
          status: 'published'
        },
        include: {
          company: {
            select: { id: true, name: true, website: true, verificationStatus: true, location: true, logoUrl: true }
          }
        },
        take: 6,
        orderBy: { createdAt: 'desc' }
      });
    }

    const recommendedInternships = await prisma.job.findMany({
      where: {
        companyId: { in: verifiedCompanyIds },
        status: 'published',
        type: 'internship'
      },
      include: {
        company: {
          select: { id: true, name: true, website: true, verificationStatus: true, location: true, logoUrl: true }
        }
      },
      take: 6,
      orderBy: { createdAt: 'desc' }
    });

    const formatJob = (j) => {
      const job = { ...j, _id: j.id };
      if (job.company) {
        job.company._id = job.company.id;
        job.companyId = job.company;
      }
      return job;
    };

    const savedJobs = await this.getSavedJobs(userId);

    return {
      profile,
      completeness,
      resumeStatus: profile.resumeUrl ? 'Uploaded' : 'Missing',
      resumeUrl: profile.resumeUrl,
      resumeOriginalName: profile.resumeOriginalName,
      resumeSize: profile.resumeSize || 0,
      applicationsCount: applications.length,
      applications: formattedApplications,
      recommendedJobs: recommendedJobs.map(formatJob),
      recommendedInternships: recommendedInternships.map(formatJob),
      savedJobs
    };
  }

  async applyToJob(userId, jobId, notes = '') {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true }
    });

    if (!job) {
      throw new Error('Job listing not found');
    }

    if (job.status !== 'published') {
      throw new Error('This position is no longer accepting applications');
    }

    if (job.company.verificationStatus !== 'valid') {
      throw new Error('Applications can only be submitted to verified companies');
    }

    const existing = await prisma.application.findUnique({
      where: {
        jobId_candidateId: {
          jobId,
          candidateId: userId
        }
      }
    });

    if (existing) {
      throw new Error('You have already applied for this position');
    }

    const application = await prisma.application.create({
      data: {
        jobId,
        candidateId: userId,
        companyId: job.company.id,
        notes,
        status: 'applied'
      }
    });

    application._id = application.id;

    try {
      const candidateUser = await prisma.user.findUnique({ where: { id: userId } });
      const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
      const candidateName = profile?.name || (candidateUser ? candidateUser.email.split('@')[0] : 'Candidate');
      const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (candidateUser?.email) {
        await emailService.sendApplicationConfirmation(candidateUser.email, {
          candidateName,
          jobTitle: job.title,
          companyName: job.company.name,
          jobType: job.type || 'Full-Time',
          location: job.location || 'Remote',
          applicationId: application.id,
          appliedDate: formattedDate,
          status: 'Applied'
        });
      }

      if (job.company.ownerUserId) {
        const recruiterUser = await prisma.user.findUnique({ where: { id: job.company.ownerUserId } });
        if (recruiterUser?.email) {
          await emailService.sendRecruiterApplicationNotification(recruiterUser.email, {
            candidateName,
            jobTitle: job.title,
            applicationId: application.id,
            appliedDate: formattedDate,
            status: 'Applied'
          });
        }
      }
    } catch (emailErr) {
      console.warn('[CandidateService] Email notification error (application safely recorded):', emailErr.message);
    }

    return application;
  }

  async getApplications(userId) {
    const applications = await prisma.application.findMany({
      where: { candidateId: userId },
      include: {
        job: true,
        company: true
      },
      orderBy: { appliedAt: 'desc' }
    });

    return applications.map((a) => {
      const app = { ...a, _id: a.id };
      if (app.job) {
        app.job._id = app.job.id;
        app.jobId = app.job;
      }
      if (app.company) {
        app.company._id = app.company.id;
        app.companyId = app.company;
      }
      return app;
    });
  }
}

module.exports = new CandidateService();
