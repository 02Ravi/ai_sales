// src/apps/chatAgent.service.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { SERVICES } = require('../constants');
const {
  saveSession,
  saveMessage,
  getChatHistory: dbGetChatHistory,
  getSession,
} = require('../utils/db');

/* ============================== Model Setup ============================== */

let _genAI = null;
function getGenAI() {
  if (_genAI) return _genAI;
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      'Missing GEMINI_API_KEY/GOOGLE_API_KEY. Put it in .env and load dotenv before start.'
    );
  }
  _genAI = new GoogleGenerativeAI(key);
  return _genAI;
}

/* ============================== Zod Schemas ============================== */
// We keep "additional" in the schema for compatibility with any old data,
// but the app no longer uses contact/email/phone for behavior.

const BudgetSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
  })
  .optional();

const ExtractionSchema = z.object({
  company: z
    .object({
      name: z.string().optional(),
      industry: z.string().optional(),
      location: z.string().optional(),
    })
    .partial()
    .default({}),
  hiring: z
    .object({
      roles: z.array(z.string()).default([]),
      location: z.string().optional(),
      count: z.number().int().positive().optional(),
      urgency: z.boolean().optional(),
      timeline: z.string().optional(),
      budget: BudgetSchema,
    })
    .partial()
    .default({ roles: [] }),
  additional: z
    .object({
      contactPreference: z.enum(['email', 'call']).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(7).optional(),
      notes: z.string().optional(),
    })
    .partial()
    .default({}),
  missing_fields: z
    .array(
      z.enum(['roles', 'location', 'count', 'timeline', 'budget', 'urgency', 'contact'])
    )
    .optional()
    .default([]),
  recommendedServiceId: z.string().optional(),
  assistant_message: z.string().min(1).default(''),
  next_action: z
    .enum([
      'ask_missing',
      'propose_recommendation',
      'request_contact_email',
      'request_contact_phone',
      'send_proposal_email',
      'schedule_call',
    ])
    .optional(),
  drafts: z
    .object({
      email_subject: z.string().optional(),
      email_body: z.string().optional(),
      sms_text: z.string().optional(),
    })
    .partial()
    .optional(),
});

/* ===== Convert Zod -> JSON Schema, then sanitize for Gemini ===== */

const RAW_JSON_SCHEMA =
  zodToJsonSchema(ExtractionSchema, { name: 'Extraction', target: 'jsonSchema7' });

function sanitizeForGemini(schema) {
  const allow = new Set(['type', 'properties', 'items', 'enum', 'required']);
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);

  if (schema && typeof schema === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (!allow.has(k)) continue;
      if (k === 'properties' && v && typeof v === 'object') {
        out.properties = {};
        for (const [pk, pv] of Object.entries(v)) {
          out.properties[pk] = sanitizeForGemini(pv);
        }
        continue;
      }
      out[k] = sanitizeForGemini(v);
    }

    if (out.type === 'object' && !out.properties) out.properties = {};
    if (out.type === 'array' && out.items == null) out.items = { type: 'string' };
    if (out.type === 'integer') out.type = 'integer';

    return out;
  }
  return schema;
}

const ExtractionJsonSchema = sanitizeForGemini(
  RAW_JSON_SCHEMA.definitions?.Extraction || RAW_JSON_SCHEMA
);

/* ============================== Utilities ================================ */

const mergeShallow = (a, b) => ({ ...(a || {}), ...(b || {}) });
const union = (A, B) => Array.from(new Set([...(A || []), ...(B || [])])).filter(Boolean);

const isFilled = (v) => {
  if (Array.isArray(v)) return v.filter(Boolean).length > 0;
  return v !== undefined && v !== null && String(v).trim() !== '';
};
const pick = (oldVal, newVal) => (isFilled(newVal) ? newVal : oldVal);

/** Freeze-once merge: if prev has a value, NEVER overwrite it */
function mergeFrozen(prev, curr) {
  const p = prev || {};
  const c = curr || {};

  const out = {
    company: {
      name: isFilled(p?.company?.name) ? p.company.name : c?.company?.name,
      industry: isFilled(p?.company?.industry) ? p.company.industry : c?.company?.industry,
      location: isFilled(p?.company?.location) ? p.company.location : c?.company?.location,
    },
    hiring: {
      roles: isFilled(p?.hiring?.roles) ? p.hiring.roles : (c?.hiring?.roles || []),
      location: isFilled(p?.hiring?.location) ? p.hiring.location : c?.hiring?.location,
      count: isFilled(p?.hiring?.count) ? p.hiring.count : c?.hiring?.count,
      urgency: isFilled(p?.hiring?.urgency) ? p.hiring.urgency : c?.hiring?.urgency,
      timeline: isFilled(p?.hiring?.timeline) ? p.hiring.timeline : c?.hiring?.timeline,
      budget: isFilled(p?.hiring?.budget) ? p.hiring.budget : c?.hiring?.budget,
    },
    additional: {
      contactPreference: isFilled(p?.additional?.contactPreference)
        ? p.additional.contactPreference
        : c?.additional?.contactPreference,
      email: isFilled(p?.additional?.email) ? p.additional.email : c?.additional?.email,
      phone: isFilled(p?.additional?.phone) ? p.additional.phone : c?.additional?.phone,
      notes: isFilled(p?.additional?.notes) ? p.additional.notes : c?.additional?.notes,
    },
    recommendedServiceId: isFilled(p?.recommendedServiceId)
      ? p.recommendedServiceId
      : c?.recommendedServiceId,
    missing_fields: c?.missing_fields || p?.missing_fields || [],
    // We no longer use any _finalized flags; keep data fluid for edits.
  };

  return out;
}

const SERVICE_IDS = SERVICES.map((s) => s.id);
const SERVICE_CATALOG_LIGHT = SERVICES.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  roles: s.roles,
  minCount: s.minCount,
  maxCount: s.maxCount,
}));

function keepValidServiceId(id) {
  return SERVICE_IDS.includes(id) ? id : undefined;
}

/* ---------- Follow-up helpers ---------- */

function computeMissingFieldsFromMerged(merged) {
  const h = merged?.hiring || {};
  const missing = [];
  if (!isFilled(h.roles)) missing.push('roles');
  if (!isFilled(h.location)) missing.push('location');
  if (!isFilled(h.count)) missing.push('count');
  if (!isFilled(h.timeline)) missing.push('timeline');
  return missing;
}

function humanSummary(merged) {
  const h = merged?.hiring || {};
  const parts = [];
  if (isFilled(h.roles)) parts.push(`roles: ${h.roles.join(', ')}`);
  if (isFilled(h.location)) parts.push(`location: ${h.location}`);
  if (isFilled(h.count)) parts.push(`headcount: ${h.count}`);
  if (isFilled(h.timeline)) parts.push(`timeline: ${h.timeline}`);
  if (h.budget?.max || h.budget?.min) {
    const cur = h.budget?.currency || 'INR';
    const b = h.budget?.max ?? h.budget?.min;
    parts.push(`budget: ${cur} ${b}`);
  }
  return parts.length ? `Got it — ${parts.join(', ')}.` : '';
}

function buildTargetedFollowUp(merged, missing) {
  const summary = humanSummary(merged);
  let ask;
  if (!missing || missing.length === 0) {
    ask = 'I have enough to recommend a package.';
  } else if (missing.length === 1) {
    ask = `Could you share ${missing[0]}?`;
  } else if (missing.length === 2) {
    ask = `Could you share ${missing[0]} and ${missing[1]}?`;
  } else {
    ask = `Could you share ${missing.slice(0, -1).join(', ')} and ${missing.slice(-1)}?`;
  }
  return summary ? `${summary} ${ask}` : ask;
}

function isNonInformativeUserMessage(msg = '') {
  return /already told you|same as (above|before)|told (you)? (already|earlier)|repeat|why ask/i.test(
    msg
  );
}

/* ---------- Heuristic extractor (improved) ---------- */

function parseHeuristics(text = '') {
  const t = text.toLowerCase();

  // industry
  let industry;
  if (/\bfintech\b/.test(t)) industry = 'fintech';
  else if (/\bedtech\b/.test(t)) industry = 'edtech';
  else if (/\bhealthtech\b/.test(t)) industry = 'healthtech';
  else if (/\bsaas\b/.test(t)) industry = 'saas';
  else if (/\be-?commerce\b/.test(t)) industry = 'ecommerce';
  else if (/\blogistics\b/.test(t)) industry = 'logistics';

  // role normalization
  const norm = (s) =>
    s
      .replace(/\b(back[\s-]?end|backend dev|backend developer|backend engineer)\b/g, 'backend engineer')
      .replace(/\b(front[\s-]?end|frontend dev|frontend developer|frontend engineer)\b/g, 'frontend engineer')
      .replace(/\b(full\s*stack|full-stack|fullstack)\b/g, 'full stack engineer')
      .replace(/\b(ui\/ux|ux\/ui|product\s*designer|ui designer|ux designer)\b/g, 'ui/ux designer')
      .replace(/\bsoftware\s*engineer\b/g, 'software engineer')
      .trim();

  // roles + per-role counts
  const roleCounts = {};
  const countedRoleRegex = /(\d{1,3})\s*(?:x\s*)?([a-z\/\-\s]+?)(?:s\b|\b)(?=(?:,|\band\b|$))/gi;
  let m;
  while ((m = countedRoleRegex.exec(t))) {
    const n = parseInt(m[1], 10);
    const role = norm(m[2]);
    if (!role) continue;
    roleCounts[role] = (roleCounts[role] || 0) + n;
  }

  const dictionaryRoles = [
    'backend engineer',
    'frontend engineer',
    'full stack engineer',
    'software engineer',
    'ui/ux designer',
    'marketing',
    'sales',
    'hr',
    'product manager',
    'data scientist',
  ];
  const rolesFound = new Set(Object.keys(roleCounts));
  for (const r of dictionaryRoles) {
    const re = new RegExp(`\\b${r.replace(/[\/\-\s]/g, '[\\/\\-\\s]')}\\b`, 'i');
    if (re.test(t)) rolesFound.add(r);
  }

  let count = Object.values(roleCounts).reduce((a, b) => a + b, 0);
  if (!count) {
    const genericCount = t.match(/\b(\d{1,3})\s*(?:people|hires?|roles?|positions?|openings?)\b/);
    if (genericCount) count = parseInt(genericCount[1], 10);
    else if (rolesFound.size) count = rolesFound.size;
  }

  // location
  let location;
  const locMatch =
    t.match(/\bin\s+([a-z\s]+?)(?:,?\s*india)?(?:[.!?,]|$)/i) ||
    t.match(/\b(mumbai|delhi|bengaluru|bangalore|pune|hyderabad|chennai|gurgaon|gurugram|noida)\b/i);
  if (locMatch) location = (locMatch[1] || locMatch[0]).trim().replace(/\bindia\b/i, 'India');

  // urgency
  const urgency = /\b(asap|urgent|immediate|right away)\b/.test(t) || undefined;

  // timeline
  let timeline;
  const timeMatch = t.match(/\b(\d{1,3})\s*(day|days|week|weeks|month|months)\b/);
  if (timeMatch) timeline = `${timeMatch[1]} ${timeMatch[2]}`;

  // budget
  let budget;
  const lakhMatch = t.match(/\b(\d+(?:\.\d+)?)\s*(lakh|lakhs)\b/);
  const rupeeMatch = t.match(/\b(\d{1,3}(?:[,\d]{3})+|\d+)\s*(?:rs|rupees?|inr)\b/);
  if (lakhMatch) {
    const n = parseFloat(lakhMatch[1]);
    budget = { max: Math.round(n * 100000), currency: 'INR' };
  } else if (rupeeMatch) {
    const n = parseInt(rupeeMatch[1].replace(/,/g, ''), 10);
    budget = { max: n, currency: 'INR' };
  }

  const roles = Array.from(rolesFound);

  const out = {
    company: { ...(industry ? { industry } : {}) },
    hiring: {
      ...(roles.length ? { roles } : {}),
      ...(location ? { location } : {}),
      ...(count ? { count } : {}),
      ...(timeline ? { timeline } : {}),
      ...(budget ? { budget } : {}),
      ...(urgency !== undefined ? { urgency } : {}),
    },
    additional: {}, // not used for behavior anymore
  };

  return out;
}

/* ============================ Prompt Builders ============================ */

function buildSystemPrompt() {
  return [
    'You are a sales assistant for a recruitment agency.',
    'Return ONE JSON object that matches the responseSchema exactly (no extra keys).',
    '',
    'Extraction rules:',
    '- roles: clean human titles (array).',
    '- location: city/region/country only.',
    '- count: integer number of hires.',
    '- timeline: short strings like "10 days", "2 weeks", "3 months".',
    '- urgency: boolean from words like "urgent", "ASAP".',
    '- budget: parse "10 lakh" => 1000000 (INR).',
    '',
    'Behavior:',
    '- Use prior context plus the latest message.',
    '- If enough info is present, set recommendedServiceId using the catalog IDs.',
    '- ALWAYS produce assistant_message that asks ONLY still-missing fields.',
    '',
    'Service catalog (pick by id only):',
    JSON.stringify(SERVICE_CATALOG_LIGHT),
  ].join('\n');
}

function buildUserPrompt({ message, previous }) {
  return [
    'Previous normalized context (may be empty):',
    JSON.stringify(previous || {}, null, 2),
    '',
    'Latest user message:',
    JSON.stringify(message),
    '',
    'Return ONLY a strict JSON object (no extra text).',
  ].join('\n');
}

/* ============================ LLM Extraction ============================= */

function tryJson(raw) {
  try {
    if (!raw) return null;
    const txt = raw.trim();
    const body = txt.startsWith('{') ? txt : (txt.match(/\{[\s\S]*\}$/) || [null])[0];
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

async function llmExtract({ message, previous }) {
  const genAI = getGenAI();
  const modelName = 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemPrompt(),
  });

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: ExtractionJsonSchema,
    temperature: 0.2,
    topP: 1,
  };

  const userPrompt = buildUserPrompt({ message, previous });

  let raw1;
  try {
    const first = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig,
    });
    raw1 = await first.response.text();
  } catch (e) {
    console.error(`[Gemini ${modelName}] call #1 failed:`, e?.message);
    console.error('Cause:', e?.cause);
    throw e;
  }
  const j1 = tryJson(raw1);
  if (j1) return j1;

  // repair attempt
  const repairPrompt = [
    'The previous response was not valid JSON for the required structure.',
    'Re-output ONLY a strict JSON object matching the structure.',
    buildUserPrompt({ message, previous }),
  ].join('\n\n');

  let raw2;
  try {
    const second = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2, topP: 1 },
    });
    raw2 = await second.response.text();
  } catch (e) {
    console.error(`[Gemini ${modelName}] call #2 failed:`, e?.message);
    console.error('Cause:', e?.cause);
    throw e;
  }
  const j2 = tryJson(raw2);
  return j2 || {};
}

/* ============================== State Helpers ============================ */

async function getLatestExtracted(sessionId) {
  const history = await dbGetChatHistory(sessionId);
  for (let i = history.length - 1; i >= 0; i--) {
    const ed = history[i]?.extractedData;
    if (ed && Object.keys(ed).length) return ed;
  }
  return null;
}

/* ================================ Main Flow ============================== */

function deriveServiceId(merged) {
  return (
    merged.recommendedServiceId ||
    (SERVICES.find((s) => {
      const want = (merged.hiring?.roles || []).map((r) => String(r).toLowerCase());
      const can = (s.roles || []).map((r) => String(r).toLowerCase());
      const overlap = want.some((r) => can.includes(r));
      const count =
        typeof merged.hiring?.count === 'number' ? merged.hiring.count : want.length || 1;
      return overlap && count >= s.minCount && count <= s.maxCount;
    })?.id)
  );
}

function recommendationMessage(data) {
  const h = data?.hiring || {};
  const summaryParts = [];
  if (isFilled(h.roles)) summaryParts.push(`roles: ${h.roles.join(', ')}`);
  if (isFilled(h.location)) summaryParts.push(`location: ${h.location}`);
  if (isFilled(h.count)) summaryParts.push(`headcount: ${h.count}`);
  if (isFilled(h.timeline)) summaryParts.push(`timeline: ${h.timeline}`);
  if (h.budget?.max || h.budget?.min) {
    const cur = h.budget?.currency || 'INR';
    const b = h.budget?.max ?? h.budget?.min;
    summaryParts.push(`budget: ${cur} ${b}`);
  }
  const summary = summaryParts.length ? `Great — ${summaryParts.join(', ')}. ` : '';

  const service = SERVICES.find((s) => s.id === data.recommendedServiceId);
  if (service) {
    return `${summary}Recommended package: ${service.name}. ${service.description ? service.description : ''}`.trim();
  }

  // Fallback if no exact match
  return `${summary}Recommended package: Custom Hiring Package.`;
}

function proceedWithWhatWeKnowMessage(data, missing) {
  const rec = data.recommendedServiceId ? recommendationMessage(data) : null;
  if (rec) {
    const askOne = missing?.[0];
    return askOne ? `${rec} If you'd like to refine, please share ${askOne}.` : rec;
  }
  // If we still can't recommend, just ask missing fields
  return buildTargetedFollowUp(data, missing);
}

function arrayEq(a = [], b = []) {
  if (a.length !== b.length) return false;
  const A = [...a].sort();
  const B = [...b].sort();
  return A.every((v, i) => v === B[i]);
}

async function processMessage(message, sessionId) {
  if (!(await getSession(sessionId))) await saveSession(sessionId);
  await saveMessage(sessionId, 'user', message, null);

  const previous =
    (await getLatestExtracted(sessionId)) || { company: {}, hiring: { roles: [] }, additional: {} };

  // 1) deterministic parse of THIS message
  const heuristic = parseHeuristics(message);

  // 2) LLM extract using previous + message
  const llmObj = await llmExtract({ message, previous });

  // 3) validate LLM
  const safe = ExtractionSchema.safeParse(llmObj);
  const current = safe.success
    ? safe.data
    : {
        company: {},
        hiring: { roles: [] },
        additional: {},
        missing_fields: ['roles', 'location', 'count', 'timeline'],
        assistant_message: 'Could you share role titles, location, headcount, and timeline?',
      };

  // 4) combine: previous -> heuristic -> LLM, but never overwrite known values
  const recommendedServiceId = keepValidServiceId(current.recommendedServiceId);
  const merged = mergeFrozen(previous, heuristic);
  const merged2 = mergeFrozen(merged, { ...current, recommendedServiceId });
  const finalServiceId = deriveServiceId(merged2);
  const finalData = { ...merged2, recommendedServiceId: finalServiceId };

  // 5) decide reply
  const missing = computeMissingFieldsFromMerged(finalData);

  // repetition guard (avoid asking the same thing forever)
  const fullHistory = await dbGetChatHistory(sessionId);
  let prevMissing = [];
  for (let i = fullHistory.length - 1; i >= 0; i--) {
    const ed = fullHistory[i]?.extractedData;
    if (ed) { prevMissing = computeMissingFieldsFromMerged(ed); break; }
  }
  let sameAskStreak = 0;
  for (let i = fullHistory.length - 1; i >= 0; i--) {
    const msg = fullHistory[i];
    if (msg.role !== 'assistant') break;
    const m = computeMissingFieldsFromMerged(msg.extractedData || {});
    if (arrayEq(m, missing)) sameAskStreak++;
    else break;
  }
  const userSaidAlreadyToldYou = isNonInformativeUserMessage(message);
  const stuckOnSameMissing =
    arrayEq(prevMissing, missing) && (sameAskStreak >= 1 || userSaidAlreadyToldYou);

  let reply;
  if (missing.length === 0) {
    // We have enough info: recommend a package
    reply = recommendationMessage(finalData);
  } else if (stuckOnSameMissing) {
    // Proceed with best guess if possible
    reply = proceedWithWhatWeKnowMessage(finalData, missing);
  } else {
    // Ask only the missing fields (or use model's targeted ask if decent)
    const modelMsg = String(current.assistant_message || '').trim();
    if (modelMsg && !/roles.*location.*headcount.*timeline/i.test(modelMsg)) {
      reply = modelMsg;
    } else {
      reply = buildTargetedFollowUp(finalData, missing);
    }
  }

  // Save last reply as assistant_message to help with repetition guard
  finalData.assistant_message = reply;

  await saveMessage(sessionId, 'assistant', reply, finalData);

  return {
    message: reply,
    extractedData: finalData,
    drafts: {}, // not used anymore
  };
}

/* =========================== Conversation Logs =========================== */

async function getChatHistory(sessionId) {
  return dbGetChatHistory(sessionId);
}

module.exports = {
  processMessage,
  getChatHistory,
};
