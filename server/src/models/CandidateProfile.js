// [MIGRATED TO PRISMA & POSTGRESQL]
// Active database model defined in server/prisma/schema.prisma

class CandidateProfile {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  calculateCompleteness() {
    let score = 0;
    if (this.name && this.name.trim().length > 0) score += 15;
    if (this.headline && this.headline.trim().length > 0) score += 15;

    const edu = Array.isArray(this.education) ? this.education : [];
    if (edu.length > 0 && edu[0].college) score += 20;

    const skills = Array.isArray(this.skills) ? this.skills : [];
    if (skills.length > 0) score += 20;

    const exp = Array.isArray(this.experience) ? this.experience : [];
    if (exp.length > 0) score += 10;

    if (this.resumeUrl) score += 20;
    return Math.min(100, score);
  }
}

CandidateProfile.schema = {
  paths: {
    savedJobs: true,
    resumeSize: true,
    resumeMimeType: true,
    name: true,
    headline: true,
    education: true,
    experience: true,
    skills: true,
    resumeUrl: true
  }
};

module.exports = CandidateProfile;
