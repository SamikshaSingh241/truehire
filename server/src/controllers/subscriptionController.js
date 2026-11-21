const subscriptionService = require('../services/subscriptionService');
const prisma = require('../config/prisma');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const getCurrentSubscription = async (req, res) => {
  try {
    const recruiterId = req.user.id || req.user._id;
    const subscription = await subscriptionService.getActiveSubscription(recruiterId);
    const eligibility = await subscriptionService.canPostJob(recruiterId);
    const company = await prisma.company.findFirst({ where: { ownerUserId: recruiterId } });

    return successResponse(
      res,
      'Current subscription retrieved',
      {
        subscription,
        eligibility,
        company: company
          ? {
              id: company.id,
              _id: company.id,
              name: company.name,
              verificationStatus: company.verificationStatus
            }
          : null
      },
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getSubscriptionHistory = async (req, res) => {
  try {
    const recruiterId = req.user.id || req.user._id;
    const history = await subscriptionService.getSubscriptionHistory(recruiterId);
    return successResponse(res, 'Subscription history retrieved', history, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const recruiterId = req.user.id || req.user._id;
    const { id } = req.params;
    const subscription = await subscriptionService.cancelSubscription(recruiterId, id);
    return successResponse(res, 'Subscription cancelled successfully', subscription, 200);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await subscriptionService.getAllSubscriptions(req.query);
    return successResponse(res, 'All platform subscriptions retrieved', subscriptions, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getCurrentSubscription,
  getSubscriptionHistory,
  cancelSubscription,
  getAllSubscriptions
};
