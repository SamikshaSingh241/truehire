const prisma = require('../config/prisma');
const razorpayService = require('./razorpayService');
const subscriptionService = require('./subscriptionService');
const emailService = require('./emailService');

class PaymentService {
  async createPaymentOrder({ recruiterId, planId }) {
    if (!planId) {
      throw new Error('Plan ID is required to initiate payment');
    }

    const company = await prisma.company.findFirst({ where: { ownerUserId: recruiterId } });
    if (!company) {
      throw new Error('Please set up your company profile before purchasing a plan');
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new Error('Selected pricing plan was not found');
    }

    if (!plan.isActive) {
      throw new Error('This plan is currently not available for purchase');
    }

    const razorpayOrder = await razorpayService.createOrder({
      amount: plan.price,
      currency: plan.currency || 'INR',
      receipt: `rcpt_${company.id.slice(-6)}_${Date.now().toString().slice(-6)}`,
      notes: {
        recruiterId: recruiterId.toString(),
        companyId: company.id.toString(),
        planId: plan.id.toString(),
        planName: plan.name
      }
    });

    const payment = await prisma.payment.create({
      data: {
        recruiterId,
        companyId: company.id,
        planId: plan.id,
        razorpayOrderId: razorpayOrder.id,
        amount: plan.price,
        currency: plan.currency || 'INR',
        paymentStatus: 'pending'
      }
    });

    return {
      orderId: razorpayOrder.id,
      amount: plan.price,
      currency: plan.currency || 'INR',
      keyId: razorpayService.getPublicKey(),
      company: {
        id: company.id,
        _id: company.id,
        name: company.name
      },
      plan: {
        id: plan.id,
        _id: plan.id,
        name: plan.name,
        price: plan.price,
        durationDays: plan.durationDays,
        jobPostingLimit: plan.jobPostingLimit
      }
    };
  }

  async verifyPayment({ recruiterId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    if (!razorpay_order_id || !razorpay_payment_id) {
      throw new Error('Missing Razorpay payment verification parameters');
    }

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
    if (!payment) {
      throw new Error('Payment record not found for this order');
    }

    if (payment.recruiterId !== recruiterId) {
      throw new Error('Unauthorized: Payment belongs to another user account');
    }

    if (payment.paymentStatus === 'captured' && payment.signatureVerified) {
      const existingSub = await subscriptionService.getActiveSubscription(recruiterId);
      return {
        alreadyCaptured: true,
        payment: { ...payment, _id: payment.id },
        subscription: existingSub
      };
    }

    const isValidSignature = razorpayService.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!isValidSignature) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          paymentStatus: 'failed',
          errorReason: 'Invalid cryptographic payment signature'
        }
      });

      const user = await prisma.user.findUnique({ where: { id: recruiterId } });
      const plan = await prisma.plan.findUnique({ where: { id: payment.planId } });
      if (user?.email) {
        await emailService.sendPaymentFailureEmail(user.email, {
          recruiterName: user.email.split('@')[0],
          planName: plan?.name || 'Selected Plan',
          amount: payment.amount,
          currency: payment.currency,
          failureReason: 'Cryptographic signature verification failed'
        });
      }

      throw new Error('Payment signature verification failed. Untrusted response.');
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentStatus: 'captured',
        signatureVerified: true,
        paidAt: new Date()
      }
    });

    const subscription = await subscriptionService.activateSubscription({
      recruiterId: payment.recruiterId,
      companyId: payment.companyId,
      planId: payment.planId,
      paymentId: payment.id
    });

    try {
      const user = await prisma.user.findUnique({ where: { id: recruiterId } });
      const company = await prisma.company.findUnique({ where: { id: payment.companyId } });
      const plan = await prisma.plan.findUnique({ where: { id: payment.planId } });

      if (user?.email) {
        await emailService.sendPaymentSuccessEmail(user.email, {
          recruiterName: user.email.split('@')[0],
          companyName: company?.name || 'Your Organization',
          planName: plan?.name || 'Recruiter Subscription Plan',
          amount: payment.amount,
          currency: payment.currency,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          validUntil: subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '30 days'
        });
      }
    } catch (e) {
      console.warn('[PaymentService] Email dispatch warning:', e.message);
    }

    return {
      payment: { ...updatedPayment, _id: updatedPayment.id },
      subscription
    };
  }

  async handleWebhookEvent(rawBody, signature) {
    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new Error('Invalid webhook HMAC signature');
    }

    const eventData = JSON.parse(rawBody.toString());
    const eventId = eventData.event_id || eventData.id || `wh_${Date.now()}`;
    const eventName = eventData.event;

    const existingEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
    if (existingEvent) {
      return { status: 'already_processed', eventId };
    }

    if (eventName === 'payment.captured') {
      const paymentEntity = eventData.payload?.payment?.entity;
      if (paymentEntity && paymentEntity.order_id) {
        const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: paymentEntity.order_id } });
        if (payment && payment.paymentStatus !== 'captured') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              razorpayPaymentId: paymentEntity.id,
              paymentStatus: 'captured',
              signatureVerified: true,
              paidAt: new Date()
            }
          });

          await subscriptionService.activateSubscription({
            recruiterId: payment.recruiterId,
            companyId: payment.companyId,
            planId: payment.planId,
            paymentId: payment.id
          });
        }
      }
    } else if (eventName === 'payment.failed') {
      const paymentEntity = eventData.payload?.payment?.entity;
      if (paymentEntity && paymentEntity.order_id) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId: paymentEntity.order_id },
          data: {
            paymentStatus: 'failed',
            errorReason: paymentEntity.error_description || 'Payment failed at gateway'
          }
        });
      }
    }

    await prisma.webhookEvent.create({
      data: {
        eventId,
        event: eventName,
        payload: eventData,
        processed: true,
        processedAt: new Date()
      }
    });

    return { status: 'processed', eventId, event: eventName };
  }

  async getRecruiterPaymentHistory(recruiterId) {
    const payments = await prisma.payment.findMany({
      where: { recruiterId },
      include: {
        plan: { select: { id: true, name: true, slug: true, price: true, durationDays: true } },
        company: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return payments.map((p) => {
      const pay = { ...p, _id: p.id };
      if (pay.plan) pay.planId = { ...pay.plan, _id: pay.plan.id };
      if (pay.company) pay.companyId = { ...pay.company, _id: pay.company.id };
      return pay;
    });
  }

  async getAllPayments(query = {}) {
    const where = {};
    if (query.status && query.status !== 'all') {
      where.paymentStatus = query.status;
    }

    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          recruiter: { select: { id: true, email: true } },
          company: { select: { id: true, name: true, verificationStatus: true } },
          plan: { select: { id: true, name: true, slug: true, price: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.payment.count({ where })
    ]);

    const capturedPayments = await prisma.payment.findMany({
      where: { paymentStatus: 'captured' },
      select: { amount: true }
    });
    const totalRevenue = capturedPayments.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    const formattedPayments = payments.map((p) => {
      const pay = { ...p, _id: p.id };
      if (pay.recruiter) pay.recruiterId = { ...pay.recruiter, _id: pay.recruiter.id };
      if (pay.company) pay.companyId = { ...pay.company, _id: pay.company.id };
      if (pay.plan) pay.planId = { ...pay.plan, _id: pay.plan.id };
      return pay;
    });

    return {
      payments: formattedPayments,
      total,
      totalRevenue,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async processAdminRefund({ paymentId, amount, reason, adminUserId }) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        recruiter: { select: { id: true, email: true } },
        company: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } }
      }
    });

    if (!payment) {
      throw new Error('Payment record not found');
    }

    if (payment.paymentStatus !== 'captured' && payment.paymentStatus !== 'partially_refunded') {
      throw new Error(`Cannot refund payment in '${payment.paymentStatus}' state. Only captured payments can be refunded.`);
    }

    const refundAmount = amount ? Number(amount) : payment.amount;
    if (refundAmount <= 0 || refundAmount > payment.amount) {
      throw new Error(`Invalid refund amount. Must be between 1 and ₹${payment.amount}`);
    }

    const razorpayRefund = await razorpayService.initiateRefund(
      payment.razorpayPaymentId || `pay_sim_${payment.id}`,
      refundAmount,
      { reason: reason || 'Admin initiated refund', adminUserId: adminUserId.toString() }
    );

    const isFullRefund = refundAmount >= payment.amount;
    const newStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    const existingRefundDetails = Array.isArray(payment.refundDetails) ? payment.refundDetails : [];
    existingRefundDetails.push({
      refundId: razorpayRefund.id,
      amount: refundAmount,
      status: razorpayRefund.status || 'processed',
      reason: reason || 'Customer request / Admin initiated'
    });

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        paymentStatus: newStatus,
        refundDetails: existingRefundDetails
      }
    });

    if (isFullRefund) {
      const sub = await subscriptionService.getActiveSubscription(payment.recruiterId);
      if (sub && sub.paymentId === payment.id) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'cancelled' }
        });
      }
    }

    try {
      if (payment.recruiter?.email) {
        await emailService.sendRefundConfirmationEmail(payment.recruiter.email, {
          recruiterName: payment.recruiter.email.split('@')[0],
          companyName: payment.company?.name || 'Your Company',
          amount: refundAmount,
          currency: payment.currency,
          refundId: razorpayRefund.id,
          originalTransactionId: payment.razorpayPaymentId
        });
      }
    } catch (e) {
      console.warn('[PaymentService] Refund confirmation email warning:', e.message);
    }

    return {
      success: true,
      refundId: razorpayRefund.id,
      amount: refundAmount,
      status: updatedPayment.paymentStatus
    };
  }
}

module.exports = new PaymentService();
