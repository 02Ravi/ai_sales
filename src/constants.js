//cns

const SYSTEM_PROMPT = `You are an intelligent AI sales agent specializing in helping businesses find the right talent and solutions. Your role is to:

1. Understand Client Neecds: Extract and understand client requirements, company details, and hiring needs
2. Provide Relevant Solutions: Offer tailored recruitment solutions, staffing services, or relevant recommendations
3. Ask Clarifying Questions: When information is missing, ask specific questions to better understand their needs
4. Be Professional & Helpful: Maintain a professional, friendly tone while being informative and solution-oriented

Key areas you can help with:
- Recruitment and staffing needs
- Technical hiring (developers, designers, engineers)
- Company growth and scaling
- HR and talent acquisition strategies
- Industry-specific hiring challenges

Always extract structured data from conversations and provide actionable insights.`;

const DATA_EXTRACTION_PROMPT = `Extract the following information from the conversation:

1. Company Information:
   - Company name
   - Industry/sector
   - Company size (if mentioned)
   - Location

2. Hiring Requirements:
   - Job titles/roles needed
   - Number of positions
   - Required skills/technologies
   - Experience level
   - Urgency level

3. Additional Context:
   - Timeline/deadlines
   - Budget constraints (if mentioned)
   - Specific challenges or requirements
   - Contact preferences

Format the extracted data as a structured object.`;

const FOLLOW_UP_QUESTIONS = [
  "What specific skills or technologies are you looking for in these roles?",
  "What's your timeline for filling these positions?",
  "Do you have a budget range in mind for these roles?",
  "Are you open to remote candidates or do you need on-site employees?",
  "What's the company culture like, and what values are important to you?",
  "Are there any specific industry experience requirements?",
  "What growth opportunities can you offer to potential candidates?",
  "Do you have any specific challenges in your current hiring process?"
];

// --- Service catalog used by the recommender ---
const SERVICES = [
  {
    id: 'tech_startup_pack',
    name: 'Tech Startup Hiring Pack',
    description: 'Ideal for startups hiring core product/engineering/design roles. Includes sourcing, screening, and 3 shortlisted candidates per role.',
    roles: [
      'software engineer',
      'backend engineer',
      'frontend engineer',
      'full stack engineer',
      'ui/ux designer',
      'product designer'
    ],
    minCount: 1,
    maxCount: 10,
    price: 5000
  },
  {
    id: 'growth_pack',
    name: 'Growth Team Bundle',
    description: 'For fast-scaling teams hiring multiple IC roles across engineering and product. Volume pricing and parallel pipelines.',
    roles: [
      'software engineer',
      'backend engineer',
      'frontend engineer',
      'qa engineer',
      'devops engineer',
      'product manager'
    ],
    minCount: 3,
    maxCount: 20,
    price: 12000
  },
  {
    id: 'executive_search',
    name: 'Executive Search',
    description: 'Confidential search for senior leadership (Director/VP/C-Level) with targeted headhunting.',
    roles: ['cto', 'cfo', 'ceo', 'vp engineering', 'head of product'],
    minCount: 1,
    maxCount: 3,
    price: 15000
  },
  {
    id: 'contract_staffing',
    name: 'Contract / Staff Aug',
    description: 'On-demand contractors with flexible engagements. Good for urgent or short-term needs.',
    roles: [
      'software engineer',
      'data engineer',
      'ui/ux designer',
      'qa engineer',
      'devops engineer'
    ],
    minCount: 1,
    maxCount: 30,
    price: 0 // priced per seat/month; keep 0 as placeholder
  }
];

const DEFAULT_SESSION_TTL = 3600;

module.exports = {
  SYSTEM_PROMPT,
  DATA_EXTRACTION_PROMPT,
  FOLLOW_UP_QUESTIONS,
  SERVICES,
  DEFAULT_SESSION_TTL
};
