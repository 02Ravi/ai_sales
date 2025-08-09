const { z } = require('zod');

const ClientRequirementSchema = z.object({
  company: z.object({
    name: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional().nullable(),
    location: z.string().optional()
  }),

  
  
  hiring: z.object({
    roles: z.array(z.object({
      title: z.string(),
      count: z.number().optional(),
      skills: z.array(z.string()).optional(),
      experience: z.string().optional(),
      urgency: z.enum(['low', 'medium', 'high', 'urgent']).optional()
    })),
    totalPositions: z.number().optional(),
    timeline: z.string().optional(),
    budget: z.string().optional(),
    remotePolicy: z.enum(['remote', 'hybrid', 'onsite']).optional()
  }),
  
  additional: z.object({
    challenges: z.array(z.string()).optional(),
    requirements: z.array(z.string()).optional(),
    contactPreference: z.string().optional(),
    notes: z.string().optional()
  })
});

const extractClientRequirements = (text) => {
  try {
  
    const extracted = {
      company: {},
      hiring: {
        roles: []
      },
      additional: {}
    };

    // Basic keyword extraction (simplified)
    const lowerText = text.toLowerCase();
    
    // Extract company info
    if (lowerText.includes('startup')) extracted.company.industry = 'startup';
    if (lowerText.includes('fintech')) extracted.company.industry = 'fintech';
    if (lowerText.includes('mumbai')) extracted.company.location = 'Mumbai';
    
    // Extract roles
    const roleKeywords = {
      'backend engineer': 'Backend Engineer',
      'backend developer': 'Backend Developer',
      'ui/ux designer': 'UI/UX Designer',
      'frontend developer': 'Frontend Developer',
      'full stack': 'Full Stack Developer'
    };
    
    Object.entries(roleKeywords).forEach(([keyword, title]) => {
      if (lowerText.includes(keyword)) {
        extracted.hiring.roles.push({ title });
      }
    });
    
    // Extract urgency
    if (lowerText.includes('urgently') || lowerText.includes('urgent')) {
      extracted.hiring.roles.forEach(role => {
        role.urgency = 'urgent';
      });
    }
    
    // Extract count
    const countMatch = text.match(/(\d+)\s*(backend|frontend|designer|engineer|developer)/i);
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      extracted.hiring.totalPositions = count;
    }
    
    return extracted;
  } catch (error) {
    console.error('Error extracting client requirements:', error);
    return null;
  }
};

module.exports = {
  ClientRequirementSchema,
  extractClientRequirements
};
