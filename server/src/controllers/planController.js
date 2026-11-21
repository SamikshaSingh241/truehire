const prisma = require('../config/prisma');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const getPlans = async (req, res) => {
  try {
    const where = req.user?.role === 'admin' ? {} : { isActive: true };
    const plans = await prisma.plan.findMany({
      where,
      orderBy: { price: 'asc' }
    });
    const formattedPlans = plans.map((p) => ({ ...p, _id: p.id }));
    return successResponse(res, 'Pricing plans retrieved', formattedPlans, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await prisma.plan.findFirst({
      where: {
        OR: [{ id }, { slug: id }]
      }
    });

    if (!plan) {
      return errorResponse(res, 'Pricing plan not found', 404);
    }
    return successResponse(res, 'Plan details retrieved', { ...plan, _id: plan.id }, 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const createPlan = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      currency,
      billingType,
      durationDays,
      jobPostingLimit,
      featuredListing,
      analyticsEnabled,
      multipleRecruiters,
      features
    } = req.body;

    const finalSlug = (slug || name).toLowerCase().replace(/\s+/g, '-');
    const existing = await prisma.plan.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      return errorResponse(res, 'A plan with this slug already exists', 400);
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        slug: finalSlug,
        description: description || '',
        price: Number(price),
        currency: currency || 'INR',
        billingType: billingType || 'monthly',
        durationDays: durationDays ? Number(durationDays) : 30,
        jobPostingLimit: jobPostingLimit ? Number(jobPostingLimit) : 1,
        featuredListing: !!featuredListing,
        analyticsEnabled: !!analyticsEnabled,
        multipleRecruiters: !!multipleRecruiters,
        features: Array.isArray(features) ? features : [],
        isActive: true
      }
    });

    return successResponse(res, 'Pricing plan created successfully', { ...plan, _id: plan.id }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.price !== undefined) updateData.price = Number(updateData.price);
    if (updateData.durationDays !== undefined) updateData.durationDays = Number(updateData.durationDays);
    if (updateData.jobPostingLimit !== undefined) updateData.jobPostingLimit = Number(updateData.jobPostingLimit);
    delete updateData.id;
    delete updateData._id;

    const plan = await prisma.plan.update({
      where: { id },
      data: updateData
    });

    return successResponse(res, 'Pricing plan updated successfully', { ...plan, _id: plan.id }, 200);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan
};
