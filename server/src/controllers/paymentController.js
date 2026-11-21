const paymentService = require('../services/paymentService');
const prisma = require('../config/prisma');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const createOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const recruiterId = req.user.id || req.user._id;

    const orderData = await paymentService.createPaymentOrder({ recruiterId, planId });
    return successResponse(res, 'Razorpay order generated successfully', orderData, 200);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const recruiterId = req.user.id || req.user._id;

    const result = await paymentService.verifyPayment({
      recruiterId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    return successResponse(res, 'Payment verified and plan activated successfully', result, 200);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const recruiterId = req.user.id || req.user._id;
    const history = await paymentService.getRecruiterPaymentHistory(recruiterId);
    return successResponse(res, 'Payment history retrieved', history, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        plan: true,
        company: true
      }
    });

    if (!payment) {
      return errorResponse(res, 'Payment record not found', 404);
    }

    const currentUserId = (req.user.id || req.user._id).toString();
    if (req.user.role !== 'admin' && payment.recruiterId !== currentUserId) {
      return errorResponse(res, 'Unauthorized access to payment record', 403);
    }

    const formattedPayment = { ...payment, _id: payment.id };
    if (formattedPayment.plan) {
      formattedPayment.plan._id = formattedPayment.plan.id;
      formattedPayment.planId = formattedPayment.plan;
    }
    if (formattedPayment.company) {
      formattedPayment.company._id = formattedPayment.company.id;
      formattedPayment.companyId = formattedPayment.company;
    }

    return successResponse(res, 'Payment details retrieved', formattedPayment, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getAllPayments = async (req, res) => {
  try {
    const data = await paymentService.getAllPayments(req.query);
    return successResponse(res, 'All payments retrieved', data, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const processRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const adminUserId = req.user.id || req.user._id;

    const result = await paymentService.processAdminRefund({
      paymentId: id,
      amount,
      reason,
      adminUserId
    });

    return successResponse(res, 'Refund processed successfully', result, 200);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getPaymentById,
  getAllPayments,
  processRefund
};
