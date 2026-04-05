const Anthropic = require('@anthropic-ai/sdk');

// ─── Config ────────────────────────────────────────────────────────────────
const CODA_API_KEY   = process.env.CODA_API_KEY;
const CODA_DOC_ID    = 'cKc2cGnJOT';
const CODA_TABLE_ID  = 'grid-l-jaTOjaOG';
const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_ORG_ID        = '914791857';
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;

// Sentinel string Claude outputs when it has no real data to work with.
// The handler intercepts this and returns a hardcoded error — Claude never composes the error message.
const NO_DATA_SENTINEL   = '__NZF_NO_DATA__';
const NO_DATA_RESPONSE   = "I'm sorry, I wasn't able to retrieve information to answer your question right now. Please try again in a moment, or contact us directly at **1300 663 729** or **nzf.org.au/contact/** and our team will be happy to help. Jazakallah khair for your patience.";

// ─── Department & Agent IDs ────────────────────────────────────────────────
const DEPT = {
  zakat_distribution: '1253395000000435085',
  zakat_education:    '1253395000000457123',
  donor_management:   '1253395000000445607',
  finance:            '1253395000000485377',
  general:            '1253395000000468725',
};
const AGENT = {
  shahnaz:  '1253395000000474001',
  ahmed:    '1253395000000428005',
  farooq:   '1253395000000472001',
  misturah: '1253395000000783001',
  munir:    '1253395000000470001',
};

// ─── Coda row cache ────────────────────────────────────────────────────────
let codaRows    = null;
let cacheExpiry = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function getCodaRows() {
  const now = Date.now();
  if (codaRows && now < cacheExpiry) return codaRows;
  const res = await fetch(
    `https://coda.io/apis/v1/docs/${CODA_DOC_ID}/tables/${CODA_TABLE_ID}/rows` +
    `?limit=500&valueFormat=simpleWithArrays&useColumnNames=true`,
    { headers: { Authorization: `Bearer ${CODA_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Coda fetch failed: ${res.status}`);
  const data = await res.json();
  codaRows    = data.items || [];
  cacheExpiry = now + CACHE_TTL;
  console.log(`[Coda] Cache refreshed — ${codaRows.length} rows`);
  return codaRows;
}

function searchCodaRows(query, rows) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return [];
  const scored = rows.map(row => {
    const v        = row.values;
    const question = (v['Question'] || '').toLowerCase();
    const answer   = (v['Answer']   || '').toLowerCase();
    const tags     = (v['Tags']     || '').toLowerCase();
    const category = (v['Category'] || '').toLowerCase();
    const haystack = `${question} ${answer} ${tags} ${category}`;
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word)) score += 1;
      if (question.includes(word)) score += 2;
      if (tags.includes(word))     score += 1;
    }
    return { score, v };
  })
  .filter(r => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 4);
  return scored.map(r => ({
    category: r.v['Category'] || '',
    question: r.v['Question'] || '',
    answer:   r.v['Answer']   || '',
  }));
}

// ─── NZF Website search ────────────────────────────────────────────────────
const NZF_PAGES = [
  { url: 'https://nzf.org.au/about/',                  keywords: ['about','who','nzf','organisation','mission','vision','history','team'] },
  { url: 'https://nzf.org.au/apply/',                  keywords: ['apply','application','help','assistance','eligible','eligibility','need','needy','receive','recipient','support','hardship'] },
  { url: 'https://nzf.org.au/programs/',               keywords: ['program','programs','services','what we do','offer','initiative'] },
  { url: 'https://nzf.org.au/program/emergency-relief/', keywords: ['emergency','relief','urgent','crisis','immediate'] },
  { url: 'https://nzf.org.au/program/crisis-accommodation/', keywords: ['accommodation','housing','homeless','shelter','rent'] },
  { url: 'https://nzf.org.au/calculate/',              keywords: ['calculate','calculator','how much','compute','work out','figure out'] },
  { url: 'https://nzf.org.au/pay/zakat/',              keywords: ['pay zakat','give zakat','donate zakat','paying','make payment','contribute'] },
  { url: 'https://nzf.org.au/pay/sadaqah/',            keywords: ['sadaqah','sadaqa','voluntary','charity','give sadaqah','donate'] },
  { url: 'https://nzf.org.au/pay/fidyah/',             keywords: ['fidyah','missed fast','fasting','unable to fast'] },
  { url: 'https://nzf.org.au/pay/fitr/',               keywords: ['fitr','zakat ul fitr','zakat al fitr','fitrah','ramadan zakat','eid'] },
  { url: 'https://nzf.org.au/pay/tainted-wealth/',     keywords: ['tainted','interest','riba','haram income','purify','cleanse'] },
  { url: 'https://nzf.org.au/contact/',                keywords: ['contact','phone','email','reach','address','office','call','get in touch'] },
  { url: 'https://nzf.org.au/faq/',                    keywords: ['faq','frequently asked','question','answer','common'] },
  { url: 'https://nzf.org.au/zakat-faq/',              keywords: ['zakat faq','zakat question','zakat answer'] },
  { url: 'https://nzf.org.au/learn/',                  keywords: ['learn','education','understand','basics','introduction','what is zakat'] },
  { url: 'https://nzf.org.au/guides/',                 keywords: ['guide','guides','how to','handbook','resource','individual','family','retiree'] },
  { url: 'https://nzf.org.au/zakat-resources/',        keywords: ['resource','resources','material','tools','reference'] },
  { url: 'https://nzf.org.au/zakat-impact/',           keywords: ['impact','outcomes','results','distributed','helped','statistics','transparency'] },
  { url: 'https://nzf.org.au/right-to-zakat/',         keywords: ['who can receive','who is eligible','right to zakat','recipients','asnaf','deserving'] },
  { url: 'https://nzf.org.au/local-need/',             keywords: ['local','australia','local need','australian muslims','locally','why local'] },
  { url: 'https://nzf.org.au/business-zakat/',         keywords: ['business','company','trade','commercial','business zakat','stocks','inventory'] },
  { url: 'https://nzf.org.au/zakat-on-superannuation/', keywords: ['super','superannuation','retirement','pension','smsf'] },
  { url: 'https://nzf.org.au/zakat-crypto/',           keywords: ['crypto','bitcoin','ethereum','cryptocurrency','digital asset'] },
  { url: 'https://nzf.org.au/zakat-for-women/',        keywords: ['women','woman','female','sister','jewellery','jewelry','gold','ornament'] },
  { url: 'https://nzf.org.au/missed-zakat/',           keywords: ['missed','past years','owe','back pay','previous years','unpaid','forgotten'] },
  { url: 'https://nzf.org.au/bank/',                   keywords: ['bank','bsb','account number','bank transfer','eft','payid','bpay'] },
  { url: 'https://nzf.org.au/tax-receipt/',            keywords: ['tax','receipt','deductible','ato','tax return','deduction','dgr'] },
  { url: 'https://nzf.org.au/cases/',                  keywords: ['cases','case stories','stories','who we help','beneficiaries'] },
  { url: 'https://nzf.org.au/zakat-clinic/',           keywords: ['clinic','consultation','book','appointment','advisor','scholar','sheikh'] },
  { url: 'https://nzf.org.au/zakat-masterclass/',      keywords: ['masterclass','class','event','webinar','seminar','workshop'] },
  { url: 'https://nzf.org.au/blog/how-to-calculate-zakat-australia-2025/', keywords: ['how to calculate','calculation guide','step by step'] },
  { url: 'https://nzf.org.au/blog/what-is-zakat-in-islam/',                keywords: ['what is zakat','define zakat','meaning of zakat','zakat definition'] },
  { url: 'https://nzf.org.au/blog/what-is-nisab/',                         keywords: ['nisab','threshold','minimum','gold nisab','silver nisab'] },
  { url: 'https://nzf.org.au/blog/zakat-guide-superannuation/',            keywords: ['super guide','superannuation guide'] },
  { url: 'https://nzf.org.au/blog/zakat-guide-for-businesses/',            keywords: ['business guide','company zakat guide'] },
  { url: 'https://nzf.org.au/blog/what-is-fidyah-and-how-to-calculate-fidyah/', keywords: ['fidyah guide','how much fidyah','calculate fidyah'] },
  { url: 'https://nzf.org.au/blog/what-is-kaffarah/',                      keywords: ['kaffarah','expiation','penance','broken fast'] },
  { url: 'https://nzf.org.au/blog/sadaqah-vs-sadaqah-jariyah/',            keywords: ['sadaqah jariyah','ongoing charity','jariyah'] },
  { url: 'https://nzf.org.au/blog/how-to-get-rid-of-interest-money-in-islam/', keywords: ['interest money','riba','bank interest','get rid','purify income'] },
  { url: 'https://nzf.org.au/poor-and-needy/',         keywords: ['poor','needy','fuqara','masakin','low income'] },
];

async function searchNZFWebsite(query) {
  const q      = query.toLowerCase();
  const scored = NZF_PAGES
    .map(p => ({ ...p, score: p.keywords.filter(kw => q.includes(kw)).length }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (!scored.length) return { found: false };
  const results = await Promise.all(scored.map(async page => {
    try {
      const res = await fetch(page.url, {
        headers: { 'User-Agent': 'NZFChatAgent/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      let text = html
        .replace(/<script[^>]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<svg[^>]*?>[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<nav[^>]*?>[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer[^>]*?>[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
        .replace(/\s+/g,' ').trim();
      text = text.length > 1500 ? text.slice(0, 1500) + '…' : text;
      return { url: page.url, content: text };
    } catch { return null; }
  }));
  const valid = results.filter(Boolean);
  return valid.length ? { found: true, results: valid } : { found: false };
}

// ─── Zoho OAuth ────────────────────────────────────────────────────────────
// Cache Zoho access token — they last 1 hour, no need to refresh on every request
let zohoTokenCache  = null;
let zohoTokenExpiry = 0;

async function getZohoAccessToken() {
  const now = Date.now();
  if (zohoTokenCache && now < zohoTokenExpiry) return zohoTokenCache;

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);

  zohoTokenCache  = data.access_token;
  zohoTokenExpiry = now + 55 * 60 * 1000; // 55 min (token lasts 60, refresh at 55)
  console.log('[Zoho] Token refreshed');
  return zohoTokenCache;
}

// ─── Create Zoho Desk ticket ───────────────────────────────────────────────
async function createZohoDeskTicket(input, transcript) {
  const {
    name, email, subject, description, department,
    caseNameOnFile, dateApplied, emailOnCase,
    donationDate, donationType, paymentMethod, emailUsedOnline, amountPaid,
    phone, preferredContact, conversation_summary,
  } = input;

  const token      = await getZohoAccessToken();
  const deptId     = DEPT[department] || DEPT.general;
  const agentMap   = { zakat_distribution: AGENT.shahnaz, zakat_education: AGENT.ahmed, donor_management: AGENT.farooq, finance: AGENT.misturah, general: AGENT.munir };
  const assigneeId = agentMap[department] || AGENT.munir;

  // ── Build plain-text description (fast, small payload) ────────────────
  const lines = [];

  lines.push(`Query: ${description}`);
  lines.push(`Source: NZF Website Chat Agent`);

  if (preferredContact) lines.push(`Preferred contact: ${preferredContact}`);
  if (phone)            lines.push(`Mobile: ${phone}`);

  if (department === 'zakat_distribution' && (caseNameOnFile || dateApplied || emailOnCase)) {
    lines.push('');
    lines.push('-- Application Details --');
    if (caseNameOnFile) lines.push(`Name on case: ${caseNameOnFile}`);
    if (dateApplied)    lines.push(`Date applied: ${dateApplied}`);
    if (emailOnCase)    lines.push(`Email on case: ${emailOnCase}`);
  }

  if (department === 'donor_management' && (donationDate || donationType || paymentMethod || emailUsedOnline || amountPaid)) {
    lines.push('');
    lines.push('-- Donation Details --');
    if (donationDate)    lines.push(`Date: ${donationDate}`);
    if (donationType)    lines.push(`Type: ${donationType}`);
    if (paymentMethod)   lines.push(`Method: ${paymentMethod}`);
    if (emailUsedOnline) lines.push(`Email used: ${emailUsedOnline}`);
    if (amountPaid)      lines.push(`Amount: ${amountPaid}`);
  }

  if (conversation_summary) {
    lines.push('');
    lines.push('-- Summary --');
    lines.push(conversation_summary);
  }

  if (transcript && transcript.length > 0) {
    const transcriptLines = transcript.split('\n').filter(l => l.trim());
    lines.push('');
    lines.push('-- Transcript --');
    lines.push(...transcriptLines);
  }

  const desc = lines.join('<br>');

  const parts    = (name || '').trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'Visitor';

  const res = await fetch('https://desk.zoho.com/api/v1/tickets', {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json', orgId: ZOHO_ORG_ID },
    body: JSON.stringify({ subject: `[TEST] ${subject}`, description: desc, departmentId: deptId, assigneeId, status: 'Open', channel: 'Web', phone: phone || undefined, contact: { lastName, email } }),
  });
  const data = await res.json();
  console.log('[ZohoDesk] Response:', JSON.stringify(data).slice(0, 300));
  if (data.id) return { success: true, ticketId: data.id, ticketNumber: data.ticketNumber };
  return { success: false, error: data.message || JSON.stringify(data) };
}

// ─── Tools (website search + ticket only — Coda is pre-fetched) ────────────
const TOOLS = [
  {
    name: 'search_nzf_website',
    description: 'Fetch additional information from nzf.org.au. Use ONLY when: (1) visitor explicitly asks for more detail after a Coda answer, or (2) the question is about NZF programs, how to apply, pay, donate, contact us, or get resources. Do NOT use for Zakat knowledge questions that are already answered in context.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'create_zoho_desk_ticket',
    description: 'Create a support ticket in Zoho Desk. Only call after collecting all required fields from the visitor.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' }, subject: { type: 'string' },
        description: { type: 'string' },
        department: { type: 'string', enum: ['zakat_distribution','zakat_education','donor_management','finance','general'] },
        caseNameOnFile: { type: 'string' }, dateApplied: { type: 'string' }, emailOnCase: { type: 'string' },
        donationDate: { type: 'string' }, donationType: { type: 'string' }, paymentMethod: { type: 'string' },
        emailUsedOnline: { type: 'string' }, amountPaid: { type: 'string' },
        preferredContact: { type: 'string', enum: ['email','mobile'] }, phone: { type: 'string' },
        conversation_summary: { type: 'string', description: '3-5 sentence summary of the full conversation — what the visitor asked, what was answered, and what they need from the team.' },
      },
      required: ['name','email','subject','description','department'],
    },
  },
];

// ─── System prompt builder ─────────────────────────────────────────────────
function buildSystemPrompt(visitorName, visitorEmail, codaResults) {
  const identity = visitorName && visitorEmail ? `\nVISITOR: ${visitorName} | ${visitorEmail}\n` : '';

  const codaSection = codaResults.length > 0
    ? `\n━━━ CODA KNOWLEDGE BASE — USE THIS FIRST ━━━\n` +
      codaResults.map((r, i) => `[${i+1}] Category: ${r.category}\nQ: ${r.question}\nA: ${r.answer}`).join('\n\n') +
      `\n━━━ END OF CODA RESULTS ━━━\n`
    : `\n━━━ CODA: No matching results for this query ━━━\n`;

  return `You are the NZF (National Zakat Foundation Australia) website assistant. You represent NZF — always say "we", "our", "us". Greet new visitors with "Assalamu Alaikum".
${identity}${codaSection}
━━━ STRICT 5-STEP RESPONSE SEQUENCE — ALWAYS FOLLOW THIS ORDER ━━━

STEP 1 — CHECK CODA (always first)
Coda results are already in your context above. If they are relevant to the question, use them as your primary answer.
- Present the Coda answer in 2-4 sentences.
- Then ask: "Would you like more information or relevant links from our website?"

STEP 2 — CHECK WEBSITE (only if Coda has no answer, or visitor asks for more)
- If Coda has no results → call search_nzf_website immediately and share what you find.
- If Coda had an answer AND visitor wants more → call search_nzf_website and provide the relevant URL(s).
- Always present URLs as plain links (the chat makes them clickable automatically).

STEP 3 — OFFER TEAM CONTACT
After answering (whether from Coda or website), always ask:
"Would you like one of our team members to get in touch with you about this?"
If yes → go to Step 4.
If no → close warmly with: "You're always welcome to reach us at 1300 663 729 or nzf.org.au/contact/"

STEP 4 — COLLECT DETAILS FOR TICKET
Collect the visitor's contact preference (email or mobile). If mobile, ask for their number.
Also collect any query-specific details (see TICKET ROUTING below).
Ask 2 questions at a time maximum — keep it conversational.

STEP 5 — CREATE TICKET (with transcript and summary)
When you have all required details, call create_zoho_desk_ticket with:
- A concise summary of the visitor's query and what was discussed (field: description)
- The conversation_summary field: 3-5 sentence summary of the full conversation
The handler will automatically append the full transcript — you do not need to include it.

OFF-TOPIC QUESTIONS:
If the question is clearly unrelated to Zakat, Islamic finance, NZF, donations, applications, or anything we do — for example questions about salaries, politics, cooking, sports, other organisations — output immediately: __NZF_NO_DATA__
Do NOT call any tools. Do NOT try to find a partial answer. Just output: __NZF_NO_DATA__

NO DATA FALLBACK:
If Coda is empty AND search_nzf_website returns nothing → output EXACTLY: __NZF_NO_DATA__
Do NOT apologise. Do NOT explain. Do NOT offer alternatives. Just output: __NZF_NO_DATA__

━━━ WHEN TO OFFER A TICKET ━━━
Always offer to raise a ticket and connect the visitor with a team member when:
- They say they want to "speak to someone", "talk to someone", "get help", "discuss my situation", "need advice", or any similar phrase
- Their question involves a personal circumstance (medical condition, financial hardship, specific situation) that requires human judgement
- They seem stuck, frustrated, or their question cannot be fully resolved by information alone
- They say "no" to further information but still seem to have an unresolved need

When offering: say "I can raise this with one of our team members who can discuss your situation directly — would that be helpful?"
If they say yes → ask email or mobile preference → create ticket → zakat_education for Zakat questions, general for everything else.
If they say no → close warmly with contact details: 1300 663 729 or nzf.org.au/contact/

NEVER redirect someone to "contact a local mosque" or external parties without first offering to raise a ticket with our own team.

NEVER answer from your own knowledge. NEVER contradict Coda results. NEVER say "typically" or "generally" — that means you're guessing.
NEVER compose a Zakat or NZF answer without data from Coda results or the website tool. If you have no data, output: __NZF_NO_DATA__
NEVER invent ticket numbers, ticket confirmations, or any factual details not returned by a tool.

━━━ TICKET ROUTING ━━━
Application/case → collect (name on case, date applied, email on case) → zakat_distribution → Shahnaz
Donation/payment → collect (date, type, method, email if online, amount) → donor_management → Farooq
Unanswered Zakat questions → zakat_education → Ahmed
Finance/receipts → finance → Misturah
Everything else → general → Munir
Contact preference: ask email or mobile. If mobile → ask for number → add to ticket.

Ticket success → confirm warmly, name the assignee, give ticket number.
Ticket failure → "Please contact us at 1300 663 729 or nzf.org.au/contact/"

━━━ AMBIGUOUS QUESTIONS ━━━
If unclear whether the visitor means a general Zakat question, their own application, or a donation they made → ask:
"Just so I can help you best — is your question:
1. A general question about Zakat rules?
2. About an application you've submitted to NZF?
3. About a donation or payment you've made to NZF?"

━━━ TONE ━━━
Warm, human, courteous. Islamic not-for-profit — be respectful always. SHORT replies (2-4 sentences). One idea per message. Plain language.`;
}

// ─── CORS ──────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

// ─── Handler ───────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { messages, visitorName, visitorEmail } = JSON.parse(event.body);

    // Get last user message for Coda search
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userQuery   = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : lastUserMsg?.content?.[0]?.text || '';

    // Step 1: Search Coda immediately (cached after first call — near instant)
    let codaResults = [];
    try {
      const rows = await getCodaRows();
      codaResults = searchCodaRows(userQuery, rows);
      console.log(`[Coda] "${userQuery.slice(0,60)}" → ${codaResults.length} results`);
    } catch (err) {
      console.error('[Coda error]', err.message);
    }

    // Step 2: Build system prompt with Coda results baked in
    const systemPrompt = buildSystemPrompt(visitorName, visitorEmail, codaResults);

    const anthropic     = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    let claudeMessages  = messages.slice(-20);

    // Step 3: Single Claude call — no tool_use needed for Coda (already in context)
    let response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system:     systemPrompt,
      tools:      TOOLS,
      messages:   claudeMessages,
    });

    // Step 4: Tool loop — only fires for website search or ticket creation
    let iterations = 0;
    let ticketOutcome = null; // Track ticket result outside Claude's interpretation

    while (response.stop_reason === 'tool_use' && iterations < 2) {
      iterations++;
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults   = await Promise.all(toolUseBlocks.map(async (toolUse) => {
        let result;
        try {
          if      (toolUse.name === 'search_nzf_website')      result = await searchNZFWebsite(toolUse.input.query);
          else if (toolUse.name === 'create_zoho_desk_ticket') {
            // Build a clean plain-text transcript from the conversation history
            const transcript = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => {
                const role  = m.role === 'user' ? 'Visitor' : 'Agent';
                const text  = typeof m.content === 'string'
                  ? m.content
                  : Array.isArray(m.content)
                    ? m.content.filter(b => b.type === 'text').map(b => b.text).join(' ')
                    : '';
                return text.trim() ? `${role}: ${text.trim()}` : null;
              })
              .filter(Boolean)
              .join('\n');

            result = await createZohoDeskTicket(toolUse.input, transcript);
            ticketOutcome = result;
            console.log('[Ticket outcome]', JSON.stringify(result));
          }
          else result = { error: `Unknown tool: ${toolUse.name}` };
        } catch (err) {
          console.error(`[Tool error: ${toolUse.name}]`, err.message);
          result = { error: err.message };
          if (toolUse.name === 'create_zoho_desk_ticket') {
            ticketOutcome = { success: false, error: err.message };
          }
        }
        return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) };
      }));

      claudeMessages = [
        ...claudeMessages,
        { role: 'assistant', content: response.content },
        { role: 'user',      content: toolResults },
      ];

      response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   claudeMessages,
      });
    }

    // If a ticket was attempted, verify Claude's response reflects reality.
    // If the ticket failed, override with a hardcoded response — don't trust Haiku to self-report failure.
    if (ticketOutcome !== null && !ticketOutcome.success) {
      console.error('[Ticket failed] Overriding Claude response with failure message. Error:', ticketOutcome.error);
      return {
        statusCode: 200,
        headers:    CORS,
        body:       JSON.stringify({
          reply: "I'm sorry, something went wrong on our end and I wasn't able to raise that ticket. Please contact us directly at **1300 663 729** or visit **nzf.org.au/contact/** and our team will be happy to help you.",
        }),
      };
    }

    // If ticket succeeded, make sure Claude's response includes the real ticket number
    if (ticketOutcome !== null && ticketOutcome.success) {
      const textBlock = response.content.find(b => b.type === 'text');
      let reply = textBlock?.text || '';
      // If Claude invented a different ticket number, replace it with the real one
      reply = reply.replace(/#\d+/g, `#${ticketOutcome.ticketNumber}`);
      return {
        statusCode: 200,
        headers:    CORS,
        body:       JSON.stringify({ reply }),
      };
    }

    const textBlock = response.content.find(b => b.type === 'text');
    let finalReply = textBlock?.text || '';

    // If Claude output the no-data sentinel, replace with hardcoded error.
    // This ensures Claude never composes an error message from its own knowledge.
    if (finalReply.includes(NO_DATA_SENTINEL)) {
      console.log('[No data] Sentinel detected — returning hardcoded error response');
      finalReply = NO_DATA_RESPONSE;
    }

    return {
      statusCode: 200,
      headers:    CORS,
      body:       JSON.stringify({ reply: finalReply }),
    };

  } catch (err) {
    console.error('[Handler error]', err);
    return {
      statusCode: 500,
      headers:    CORS,
      body:       JSON.stringify({ error: 'Something went wrong. Please try again.' }),
    };
  }
};
