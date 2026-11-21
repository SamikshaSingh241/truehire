const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

const seedDatabase = async () => {
  try {
    console.log('[Database Seed] Initializing PostgreSQL database seeding via Prisma...');

    // Delete in reverse FK dependency order
    await prisma.savedJob.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.candidateProfile.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.loginOTP.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.user.deleteMany({});

    const salt = await bcrypt.genSalt(10);
    const adminPassHash = await bcrypt.hash('admin@123', salt);
    const recruiterPassHash = await bcrypt.hash('recruiter@123', salt);
    const candidatePassHash = await bcrypt.hash('candidate@123', salt);

    // 1. Seed Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@truehire.io',
        passwordHash: adminPassHash,
        role: 'admin'
      }
    });
    console.log('✅ Admin user created: admin@truehire.io / admin@123');

    // 2. Seed Verified Recruiter & Company (Linear Labs)
    const recruiterUser1 = await prisma.user.create({
      data: {
        email: 'recruiter@linear.app',
        passwordHash: recruiterPassHash,
        role: 'recruiter'
      }
    });

    const companyVerified = await prisma.company.create({
      data: {
        ownerUserId: recruiterUser1.id,
        name: 'Linear Labs',
        website: 'https://linear.app',
        industry: 'Developer Tools & SaaS',
        size: '50-100 employees',
        location: 'San Francisco, CA (Remote Friendly)',
        description: 'Linear is a purpose-built tool for modern software development. Streamline issues, projects, and product roadmaps with high craft.',
        logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&h=120&q=80',
        verificationStatus: 'valid',
        adminNote: 'Verified enterprise entity. Delaware C-Corp verified via domain and official corporate records.',
        reviewedById: adminUser.id,
        reviewedAt: new Date(Date.now() - 86400000 * 5)
      }
    });

    // 3. Seed Additional Verified Company (Vercel Cloud)
    const recruiterUser2 = await prisma.user.create({
      data: {
        email: 'talent@vercel.com',
        passwordHash: recruiterPassHash,
        role: 'recruiter'
      }
    });

    const companyVerified2 = await prisma.company.create({
      data: {
        ownerUserId: recruiterUser2.id,
        name: 'Vercel Cloud',
        website: 'https://vercel.com',
        industry: 'Cloud Infrastructure & Web Platforms',
        size: '200-500 employees',
        location: 'Remote / Global',
        description: 'Vercel is the platform for frontend developers, providing the speed and reliability needed to build at the speed of thought.',
        logoUrl: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=120&h=120&q=80',
        verificationStatus: 'valid',
        adminNote: 'Official corporate recruitment account authenticated and verified.',
        reviewedById: adminUser.id,
        reviewedAt: new Date(Date.now() - 86400000 * 2)
      }
    });

    // 4. Seed Pending Recruiter & Company (Arc Interactive)
    const recruiterUser3 = await prisma.user.create({
      data: {
        email: 'founder@thebrowser.company',
        passwordHash: recruiterPassHash,
        role: 'recruiter'
      }
    });

    const companyPending = await prisma.company.create({
      data: {
        ownerUserId: recruiterUser3.id,
        name: 'Arc Interactive',
        website: 'https://thebrowser.company',
        industry: 'Consumer Software & Web Browsers',
        size: '20-50 employees',
        location: 'New York, NY',
        description: 'Building Arc, a browser designed to push the internet forward with fresh UX, spaces, and fluid interactions.',
        logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&h=120&q=80',
        verificationStatus: 'pending',
        adminNote: ''
      }
    });

    // 5. Seed Invalid / Rejected Recruiter & Company
    const recruiterUser4 = await prisma.user.create({
      data: {
        email: 'contact@cryptomoon.fake',
        passwordHash: recruiterPassHash,
        role: 'recruiter'
      }
    });

    await prisma.company.create({
      data: {
        ownerUserId: recruiterUser4.id,
        name: 'CryptoMoon Rapid Growth',
        website: 'http://cryptomoon-get-rich-fast.xyz',
        industry: 'Web3 & Financial Services',
        size: '1-10 employees',
        location: 'Unknown',
        description: 'High yield financial staking and offshore telegram arbitrage.',
        verificationStatus: 'invalid',
        adminNote: 'Failed identity verification check. Unregistered legal entity with anonymous leadership and suspicious escrow terms.',
        reviewedById: adminUser.id,
        reviewedAt: new Date(Date.now() - 86400000 * 1)
      }
    });

    // 6. Seed Jobs for Verified Companies
    const job1 = await prisma.job.create({
      data: {
        companyId: companyVerified.id,
        createdById: recruiterUser1.id,
        title: 'Frontend Software Engineering Intern (React & Design Systems)',
        type: 'internship',
        description: 'Join the Core Product & Design Systems team at Linear. You will craft lightning-fast keyboard-first web interfaces in React, TypeScript, and Tailwind CSS.',
        skills: ['React', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'Web Performance'],
        salary: '₹60,000 - ₹90,000/mo',
        salaryMin: 60000,
        salaryMax: 90000,
        stipendMin: 60000,
        stipendMax: 90000,
        isPaid: true,
        currency: 'INR',
        salaryPeriod: 'monthly',
        duration: '6 Months',
        workMode: 'remote',
        location: 'Remote (Worldwide)',
        deadline: new Date(Date.now() + 86400000 * 30),
        status: 'published',
        featured: true
      }
    });

    await prisma.job.create({
      data: {
        companyId: companyVerified.id,
        createdById: recruiterUser1.id,
        title: 'Full-Stack Product Engineer',
        type: 'job',
        description: 'Build backend pipelines, WebSocket sync protocols, and high-performance collaboration features.',
        skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Prisma', 'System Design'],
        salary: '₹18,00,000 - ₹28,0,000/year',
        salaryMin: 1800000,
        salaryMax: 2800000,
        currency: 'INR',
        salaryPeriod: 'yearly',
        duration: 'Full-time',
        workMode: 'hybrid',
        location: 'San Francisco, CA',
        deadline: new Date(Date.now() + 86400000 * 45),
        status: 'published'
      }
    });

    await prisma.job.create({
      data: {
        companyId: companyVerified2.id,
        createdById: recruiterUser2.id,
        title: 'Next.js Developer Relations Intern',
        type: 'internship',
        description: 'Help developers understand Edge Middleware, Turbopack, and Next.js App Router best practices.',
        skills: ['Next.js', 'React', 'Documentation', 'Technical Writing'],
        salary: '₹45,000 - ₹65,000/mo',
        salaryMin: 45000,
        salaryMax: 65000,
        stipendMin: 45000,
        stipendMax: 65000,
        isPaid: true,
        currency: 'INR',
        salaryPeriod: 'monthly',
        duration: '3 Months',
        workMode: 'remote',
        location: 'Remote',
        deadline: new Date(Date.now() + 86400000 * 20),
        status: 'published'
      }
    });

    // 7. Seed Job for Pending Company (Hidden from public)
    await prisma.job.create({
      data: {
        companyId: companyPending.id,
        createdById: recruiterUser3.id,
        title: 'Browser Systems & C++ Intern',
        type: 'internship',
        description: 'Hack on Chromium internals, memory safety optimizations, and custom rendering pipelines.',
        skills: ['C++', 'Chromium', 'Systems Programming', 'Algorithms'],
        salary: '₹80,000/mo',
        duration: '4 Months',
        workMode: 'onsite',
        location: 'New York, NY',
        status: 'published'
      }
    });

    // 8. Seed Candidate User
    const candidateUser = await prisma.user.create({
      data: {
        email: 'alex.dev@stanford.edu',
        passwordHash: candidatePassHash,
        role: 'candidate'
      }
    });

    // 9. Candidate Profile
    await prisma.candidateProfile.create({
      data: {
        userId: candidateUser.id,
        name: 'Alex Chen',
        headline: 'Computer Science Senior @ Stanford | Full-Stack & Systems Engineer',
        education: [
          {
            college: 'Stanford University',
            degree: 'B.S. in Computer Science',
            gradYear: '2025'
          }
        ],
        skills: ['React', 'TypeScript', 'Node.js', 'Tailwind CSS', 'PostgreSQL', 'Python', 'Framer Motion'],
        experience: [
          {
            title: 'Software Engineering Intern',
            company: 'HyperScale Cloud',
            duration: 'June 2024 - Aug 2024',
            description: 'Engineered real-time telemetry dashboards in React and Node.js serving 12,000+ active enterprise developers.'
          },
          {
            title: 'Open Source Contributor',
            company: 'Modern Web Tools',
            duration: 'Jan 2024 - Present',
            description: 'Created popular UI library components with 1,500+ GitHub stars.'
          }
        ],
        preferences: {
          preferredRole: 'Frontend Intern or Full-Stack Engineer',
          location: 'Remote or San Francisco, CA'
        },
        links: {
          linkedin: 'https://linkedin.com/in/alexchen-dev',
          github: 'https://github.com/alexchen',
          portfolio: 'https://alexchen.codes'
        },
        resumeUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        resumeOriginalName: 'Alex_Chen_Resume_2025.pdf',
        profileComplete: true
      }
    });

    // 10. Seed Application
    await prisma.application.create({
      data: {
        jobId: job1.id,
        candidateId: candidateUser.id,
        companyId: companyVerified.id,
        status: 'shortlisted',
        notes: 'Strong portfolio and solid background in React & Tailwind.'
      }
    });

    // 11. Seed Recruiter Plans
    const starterPlan = await prisma.plan.create({
      data: {
        name: 'Starter',
        slug: 'starter',
        description: 'Ideal for early startups and individual hiring managers testing out hiring.',
        price: 499,
        currency: 'INR',
        billingType: 'per_job',
        durationDays: 30,
        jobPostingLimit: 1,
        featuredListing: false,
        analyticsEnabled: false,
        multipleRecruiters: false,
        features: [
          '1 Job Posting',
          '30 Days Listing',
          'Applicant Management',
          'Basic Application Tracking'
        ],
        isActive: true
      }
    });

    const proPlan = await prisma.plan.create({
      data: {
        name: 'Professional',
        slug: 'professional',
        description: 'Perfect for growing companies hiring developers, designers, and growth talent.',
        price: 1499,
        currency: 'INR',
        billingType: 'monthly',
        durationDays: 30,
        jobPostingLimit: 5,
        featuredListing: true,
        analyticsEnabled: true,
        multipleRecruiters: false,
        features: [
          '5 Active Job Listings',
          'Featured Job Listing',
          'Applicant Tracking',
          'Recruiter Dashboard Analytics',
          '30 Days Subscription'
        ],
        isActive: true
      }
    });

    await prisma.plan.create({
      data: {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'For scale-ups and enterprises with aggressive talent acquisition pipelines.',
        price: 3999,
        currency: 'INR',
        billingType: 'monthly',
        durationDays: 30,
        jobPostingLimit: 20,
        featuredListing: true,
        analyticsEnabled: true,
        multipleRecruiters: true,
        features: [
          '20 Active Job Listings',
          'Priority Job Visibility',
          'Advanced Hiring Analytics',
          'Multiple Recruiter Accounts',
          '30 Days Subscription'
        ],
        isActive: true
      }
    });

    // Seed active subscription for Linear demo recruiter
    await prisma.subscription.create({
      data: {
        recruiterId: recruiterUser1.id,
        companyId: companyVerified.id,
        planId: proPlan.id,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        jobPostingLimit: 5,
        usedJobPostings: 2,
        activeJobCount: 2,
        features: {
          featuredListing: true,
          analyticsEnabled: true,
          multipleRecruiters: false
        }
      }
    });

    console.log('[Database Seed] Seeding completed successfully!');
    console.log('--------------------------------------------------');
    console.log('DEMO ACCOUNTS READY (PostgreSQL via Prisma):');
    console.log('👑 Admin:     admin@truehire.io / admin@123');
    console.log('🏢 Recruiter: recruiter@linear.app / recruiter@123 (Verified Company)');
    console.log('⏳ Recruiter: founder@thebrowser.company / recruiter@123 (Pending Company)');
    console.log('🎓 Candidate: alex.dev@stanford.edu / candidate@123');
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('[Database Seed] Seeding error:', err);
    throw err;
  }
};

module.exports = { seedDatabase };
