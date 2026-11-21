const prisma = require('../config/prisma');

class SubscriptionService {
  async getActiveSubscription(recruiterId) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: recruiterId } });
    if (!company) {
      return null;
    }

    let subscription = await prisma.subscription.findFirst({
      where: {
        companyId: company.id,
        status: 'active'
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!subscription) {
      return null;
    }

    if (subscription.endDate && new Date() > new Date(subscription.endDate)) {
      subscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
        include: { plan: true }
      });
      return null;
    }

    const actualActiveJobs = await prisma.job.count({
      where: {
        companyId: company.id,
        status: 'published'
      }
    });

    if (subscription.activeJobCount !== actualActiveJobs) {
      subscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: { activeJobCount: actualActiveJobs },
        include: { plan: true }
      });
    }

    const sub = { ...subscription, _id: subscription.id };
    if (sub.plan) {
      sub.plan._id = sub.plan.id;
      sub.planId = sub.plan;
    }
    return sub;
  }

  async activateSubscription({ recruiterId, companyId, planId, paymentId }) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new Error('Plan not found for subscription activation');
    }

    const durationDays = plan.durationDays || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await prisma.subscription.updateMany({
      where: { companyId, status: 'active' },
      data: { status: 'expired' }
    });

    const currentActiveJobs = await prisma.job.count({
      where: {
        companyId,
        status: 'published'
      }
    });

    const subscription = await prisma.subscription.create({
      data: {
        recruiterId,
        companyId,
        planId: plan.id,
        paymentId: paymentId || null,
        status: 'active',
        startDate,
        endDate,
        jobPostingLimit: plan.jobPostingLimit || 1,
        usedJobPostings: 0,
        activeJobCount: currentActiveJobs,
        autoRenew: false,
        features: {
          featuredListing: !!plan.featuredListing,
          analyticsEnabled: !!plan.analyticsEnabled,
          multipleRecruiters: !!plan.multipleRecruiters
        }
      },
      include: { plan: true }
    });

    const sub = { ...subscription, _id: subscription.id };
    if (sub.plan) {
      sub.plan._id = sub.plan.id;
      sub.planId = sub.plan;
    }
    return sub;
  }

  async canPostJob(recruiterId) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: recruiterId } });
    if (!company) {
      return {
        allowed: false,
        reason: 'Company profile not found. Please set up your company details first.'
      };
    }

    if (company.verificationStatus !== 'valid') {
      return {
        allowed: false,
        reason: `Your company verification is ${company.verificationStatus}. Only admin-approved companies can publish jobs to the marketplace.`,
        verificationPending: true,
        company: { ...company, _id: company.id }
      };
    }

    const subscription = await this.getActiveSubscription(recruiterId);
    if (!subscription) {
      return {
        allowed: false,
        reason: 'No active subscription or job posting credits found. Please choose a plan to post jobs.',
        needsPlan: true,
        company: { ...company, _id: company.id }
      };
    }

    if (subscription.usedJobPostings >= subscription.jobPostingLimit) {
      return {
        allowed: false,
        reason: `You have reached your plan limit of ${subscription.jobPostingLimit} job postings. Please upgrade or renew your plan.`,
        quotaExceeded: true,
        subscription,
        company: { ...company, _id: company.id }
      };
    }

    if (subscription.activeJobCount >= subscription.jobPostingLimit) {
      return {
        allowed: false,
        reason: `You currently have ${subscription.activeJobCount} active jobs, reaching your limit of ${subscription.jobPostingLimit}. Please close an existing job or upgrade.`,
        limitReached: true,
        subscription,
        company: { ...company, _id: company.id }
      };
    }

    return {
      allowed: true,
      subscription,
      company: { ...company, _id: company.id }
    };
  }

  async consumeJobEntitlement(recruiterId) {
    const check = await this.canPostJob(recruiterId);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const updated = await prisma.subscription.update({
      where: { id: check.subscription.id },
      data: {
        usedJobPostings: { increment: 1 },
        activeJobCount: { increment: 1 }
      },
      include: { plan: true }
    });

    const sub = { ...updated, _id: updated.id };
    if (sub.plan) {
      sub.plan._id = sub.plan.id;
      sub.planId = sub.plan;
    }
    return sub;
  }

  async releaseJobEntitlement(companyId) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        companyId,
        status: 'active'
      }
    });

    if (subscription && subscription.activeJobCount > 0) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { activeJobCount: Math.max(0, subscription.activeJobCount - 1) }
      });
    }
  }

  async cancelSubscription(recruiterId, subscriptionId) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        recruiterId
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found or unauthorized');
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'cancelled' }
    });

    return { ...updated, _id: updated.id };
  }

  async getSubscriptionHistory(recruiterId) {
    const company = await prisma.company.findFirst({ where: { ownerUserId: recruiterId } });
    if (!company) {
      return [];
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { companyId: company.id },
      include: {
        plan: true,
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return subscriptions.map((s) => {
      const sub = { ...s, _id: s.id };
      if (sub.plan) {
        sub.plan._id = sub.plan.id;
        sub.planId = sub.plan;
      }
      if (sub.payment) {
        sub.payment._id = sub.payment.id;
        sub.paymentId = sub.payment;
      }
      return sub;
    });
  }

  async getAllSubscriptions(query = {}) {
    const where = {};
    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        recruiter: { select: { id: true, email: true } },
        company: { select: { id: true, name: true, verificationStatus: true } },
        plan: { select: { id: true, name: true, price: true, slug: true } },
        payment: { select: { id: true, amount: true, paymentStatus: true, razorpayPaymentId: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return subscriptions.map((s) => {
      const sub = { ...s, _id: s.id };
      if (sub.recruiter) sub.recruiterId = { ...sub.recruiter, _id: sub.recruiter.id };
      if (sub.company) sub.companyId = { ...sub.company, _id: sub.company.id };
      if (sub.plan) sub.planId = { ...sub.plan, _id: sub.plan.id };
      if (sub.payment) sub.paymentId = { ...sub.payment, _id: sub.payment.id };
      return sub;
    });
  }
}

module.exports = new SubscriptionService();
