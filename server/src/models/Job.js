// [MIGRATED TO PRISMA & POSTGRESQL]
// Active database model defined in server/prisma/schema.prisma

class Job {
  constructor(data = {}) {
    Object.assign(this, data);
  }
}

Job.schema = {
  paths: {
    title: true,
    type: true,
    description: true,
    skills: true,
    salary: true,
    salaryMin: true,
    salaryMax: true,
    currency: true,
    salaryPeriod: true,
    hideSalary: true,
    isNegotiable: true,
    isPaid: true,
    stipendMin: true,
    stipendMax: true,
    featured: true,
    viewsCount: true,
    duration: true,
    workMode: true,
    location: true,
    deadline: true,
    status: true
  }
};

module.exports = Job;
