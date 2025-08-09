// src/apps/chatAgent.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { SERVICES } = require('../constants');
const { z } = require('zod');
const {
  saveSession,
  saveMessage,
  getChatHistory: dbGetChatHistory,
  getSession,
} = require('../utils/db');

// --------- Lazy Gemini init ---------
let _genAI = null;
function getGenAI() {
  if (_genAI) return _genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  _genAI = new GoogleGenerativeAI(key);
  return _genAI;
}

// ---------- schema ----------
const clientRequirementSchema = z.object({
  industry: z.string().optional(),
  location: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  count: z.number().int().positive().optional(),
  urgency: z.boolean().optional(),
  budget: z
    .object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
    })
    .partial()
    .optional(),
  timeline: z.string().optional(),
});

// ---------- helpers ----------
function titleCase(s) {
  return s
    .split(' ')
    .filter(Boolean)
    .map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Try to pull JSON object even if model wraps in code fences
function extractJson(text) {
  // strip fences ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const match = candidate.match(/\{[\s\S]*\}$/);
  return match ? match[0] : null;
}

// Super-light heuristic extractor for short messages like "software engineer in delhi"
function heuristicExtract(message) {
  const msg = String(message).trim();

  // urgency keywords
  const urgent = /\b(urgent|asap|immediate|immediately|right away)\b/i.test(msg);

  // count
  const countMatch = msg.match(/\b(\d+)\b/);
  const count = countMatch ? parseInt(countMatch[1], 10) : undefined;

  // split by " in <location>" (last occurrence)
  const inIdx = msg.toLowerCase().lastIndexOf(' in ');
  let rolesPart = msg;
  let location;
  if (inIdx !== -1) {
    rolesPart = msg.slice(0, inIdx).trim();
    location = titleCase(msg.slice(inIdx + 4).trim()); // 4 = " in ".length
  }

  // roles: naive split by commas, "and"
  let roles = rolesPart
    .split(/,| and /i)
    .map(s => s.trim())
    .filter(Boolean);

  // common cleanup
  roles = roles.map(r => r.replace(/^hiring\s+/i, '').replace(/^need(s)?\s+/i, '').trim());

  // if nothing sensible, bail
  if ((!roles || roles.length === 0) && !location) return null;

  // default: if we have a phrase without commas like "software engineer"
  if (roles.length === 1 && /\s/.test(roles[0]) === false && inIdx !== -1) {
    // single token before "in" might be vague; but keep it
  }

  return {
    location: location || undefined,
    roles: roles && roles.length ? roles : undefined,
    count: count,
    urgency: urgent || undefined,
  };
}

function pickRecommendation(requirements) {
  if (!requirements?.roles?.length) return null;
  const totalCount = requirements.count || requirements.roles.length;

  return (
    SERVICES.find((s) => {
      const roleOverlap = requirements.roles.some((r) =>
        s.roles.map((x) => x.toLowerCase()).includes(String(r).toLowerCase())
      );
      return roleOverlap && totalCount >= s.minCount && totalCount <= s.maxCount;
    }) || null
  );
}

// ---------- Gemini extraction with strict JSON schema ----------
async function geminiExtractRequirements(message) {
  const genAI = getGenAI();

  // Use a structured output schema so Gemini must return JSON
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        industry: { type: 'string' },
        location: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
        count: { type: 'integer' },
        urgency: { type: 'boolean' },
        budget: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
            currency: { type: 'string' },
          },
          optional: true,
        },
        timeline: { type: 'string' },
      },
      required: ['location', 'roles'],
    },
  };

  const prompt = `
Extract the client's hiring requirements from the message.
Follow this guidance:
- If a field isn't explicitly given, omit it.
- Infer urgency from words like "urgent", "ASAP", etc.
- Roles should be an array of strings.
- Location must be a single city/region string if present.

Message: ${JSON.stringify(message)}
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  });

  const response = await result.response;
  const text = await response.text(); // should be pure JSON per config
  return text;
}

// ---------- public api ----------
async function processMessage(message, sessionId) {
  // ensure session exists
  const existing = await getSession(sessionId);
  if (!existing) {
    await saveSession(sessionId);
  }

  // log user message
  await saveMessage(sessionId, 'user', message, null);

  // extract requirements (Gemini → strict JSON) with fallbacks
  let extractedData = null;

  // 1) Try Gemini structured output
  try {
    const raw = await geminiExtractRequirements(message);
    const jsonStr = extractJson(raw) || raw; // in case SDK returns plain JSON string
    const parsed = JSON.parse(jsonStr);
    extractedData = clientRequirementSchema.safeParse(parsed).success
      ? parsed
      : null;
  } catch (e) {
    extractedData = null;
  }

  // 2) If still null, try heuristic extraction
  if (!extractedData) {
    const guess = heuristicExtract(message);
    if (guess && guess.location && guess.roles?.length) {
      // minimal valid object; let zod validate
      const res = clientRequirementSchema.safeParse(guess);
      if (res.success) {
        extractedData = res.data;
      }
    }
  }

  // build reply
  let reply;
  if (extractedData) {
    const rec = pickRecommendation(extractedData);
    if (rec) {
      reply = `Great! Based on your requirements, I recommend our *${rec.name}*. ${rec.description} Would you like me to send over a proposal or schedule a quick call?`;
    } else {
      reply =
        'Thanks for the details. I have a few packages that could suit your needs. Would you like a quick proposal or a short call to confirm the scope?';
    }
  } else {
    reply =
      'Got it. Could you share a bit more about your hiring needs? For example: roles, location, number of positions, and how urgent this is.';
  }

  // log assistant message (store extractedData for convenience)
  await saveMessage(sessionId, 'assistant', reply, extractedData || null);

  return {
    message: reply,
    extractedData: extractedData || null,
  };
}

async function getChatHistory(sessionId) {
  return dbGetChatHistory(sessionId);
}

module.exports = {
  processMessage,
  getChatHistory,
};
