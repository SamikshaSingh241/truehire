const prisma = require('../config/prisma');
const jobService = require('../services/jobService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const getCompany = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    let company = await prisma.company.findFirst({ where: { ownerUserId: userId } });
    if (!company) {
      company = await prisma.company.create({
        data: {
          ownerUserId: userId,
          name: `${req.user.email.split('@')[0]} Org`,
          verificationStatus: 'pending'
        }
      });
    }
    return successResponse(res, 'Company details retrieved', { ...company, _id: company.id });
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const updateCompany = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, website, industry, size, location, description, logoUrl } = req.body;
    let company = await prisma.company.findFirst({ where: { ownerUserId: userId } });

    if (!company) {
      company = await prisma.company.create({
        data: {
          ownerUserId: userId,
          name: name || `${req.user.email.split('@')[0]} Org`,
          website,
          industry,
          size,
          location,
          description,
          logoUrl,
          verificationStatus: 'pending'
        }
      });
    } else {
      company = await prisma.company.update({
        where: { id: company.id },
        data: {
          name: name || company.name,
          website: website !== undefined ? website : company.website,
          industry: industry || company.industry,
          size: size || company.size,
          location: location || company.location,
          description: description !== undefined ? description : company.description,
          logoUrl: logoUrl || company.logoUrl
        }
      });
    }

    return successResponse(res, 'Company profile updated successfully', { ...company, _id: company.id });
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const data = await jobService.getRecruiterDashboardData(userId);
    return successResponse(res, 'Recruiter dashboard data retrieved', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const updateApplicationStatus = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    let { status, notes } = req.body;

    const company = await prisma.company.findFirst({ where: { ownerUserId: userId } });
    if (!company) {
      return errorResponse(res, 'Recruiter company not found', 404);
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: { job: true }
    });

    if (!application) {
      return errorResponse(res, 'Application not found', 404);
    }

    if (application.companyId !== company.id && application.job?.companyId !== company.id) {
      return errorResponse(res, 'Unauthorized to update this application', 403);
    }

    const validStatuses = ['applied', 'under_review', 'shortlisted', 'rejected', 'accepted', 'interview_scheduled'];
    if (!validStatuses.includes(status)) {
      status = 'shortlisted';
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {})
      }
    });

    return successResponse(res, 'Application status updated successfully', { ...updated, _id: updated.id });
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  getCompany,
  updateCompany,
  getDashboard,
  updateApplicationStatus
};
