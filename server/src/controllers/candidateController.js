const candidateService = require('../services/candidateService');
const fileStorageService = require('../services/fileStorageService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const data = await candidateService.getProfile(userId);
    return successResponse(res, 'Candidate profile retrieved', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const data = await candidateService.updateProfile(userId, req.body);
    return successResponse(res, 'Candidate profile updated successfully', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const uploadResume = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No resume file uploaded', 400);
    }

    const userId = req.user.id || req.user._id;
    const fileUrl = fileStorageService.getFileUrl(req, req.file);
    const data = await candidateService.updateResume(userId, req.file, fileUrl);
    return successResponse(res, 'Resume uploaded successfully', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const data = await candidateService.getDashboardData(userId);
    return successResponse(res, 'Candidate dashboard data retrieved', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const applyJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { notes } = req.body;
    const userId = req.user.id || req.user._id;
    const application = await candidateService.applyToJob(userId, jobId, notes);
    return successResponse(res, 'Application submitted successfully', application, 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getApplications = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const applications = await candidateService.getApplications(userId);
    return successResponse(res, 'Candidate applications retrieved', applications);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const deleteResume = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const data = await candidateService.deleteResume(userId);
    return successResponse(res, 'Resume deleted successfully', data);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const saveJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id || req.user._id;
    const savedJobs = await candidateService.saveJob(userId, jobId);
    return successResponse(res, 'Job saved successfully', savedJobs);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const unsaveJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id || req.user._id;
    const savedJobs = await candidateService.unsaveJob(userId, jobId);
    return successResponse(res, 'Job removed from saved list', savedJobs);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getSavedJobs = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const savedJobs = await candidateService.getSavedJobs(userId);
    return successResponse(res, 'Saved jobs retrieved', savedJobs);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadResume,
  deleteResume,
  saveJob,
  unsaveJob,
  getSavedJobs,
  getDashboard,
  applyJob,
  getApplications
};
