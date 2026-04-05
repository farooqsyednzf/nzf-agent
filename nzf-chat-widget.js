/**
 * NZF Chat Widget
 * Embeddable chat agent for nzf.org.au
 *
 * Usage:
 *   <script>
 *     window.NZFChatConfig = { apiUrl: 'https://your-site.netlify.app/.netlify/functions/chat' };
 *   </script>
 *   <script src="/nzf-chat-widget.js" defer></script>
 */
(function () {
  'use strict';

  const CONFIG = window.NZFChatConfig || {};
  const API_URL = CONFIG.apiUrl || '/.netlify/functions/chat';

  // ─── State ─────────────────────────────────────────────────────────────
  let isOpen        = false;
  let isTyping      = false;
  let sessionReady  = false;
  let visitorName   = '';
  let visitorEmail  = '';
  let chatHistory   = [];   // [{role, content}] for Claude API
  let nameInput, emailInput;

  // ─── Inject styles ──────────────────────────────────────────────────────
  const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Bree+Serif&family=DM+Sans:wght@400;500;600&display=swap');

    #nzf-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; }

    #nzf-chat-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #BE1E2D;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(190,30,45,0.45);
      z-index: 99998;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #nzf-chat-fab:hover {
      transform: scale(1.07);
      box-shadow: 0 6px 28px rgba(190,30,45,0.55);
    }
    #nzf-chat-fab svg { pointer-events: none; }

    #nzf-chat-panel {
      position: fixed;
      bottom: 100px;
      right: 28px;
      width: 380px;
      max-height: 580px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.18);
      display: flex;
      flex-direction: column;
      z-index: 99999;
      font-family: 'DM Sans', sans-serif;
      overflow: hidden;
      transform: translateY(16px) scale(0.97);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    #nzf-chat-panel.nzf-open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }

    /* Header */
    #nzf-chat-header {
      background: #BE1E2D;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    #nzf-chat-header-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    #nzf-chat-header-text { flex: 1; }
    #nzf-chat-header-title {
      font-family: 'Bree Serif', serif;
      color: #fff;
      font-size: 15px;
      line-height: 1.2;
    }
    #nzf-chat-header-status {
      font-size: 12px;
      color: rgba(255,255,255,0.8);
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .nzf-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #7fff7f;
      display: inline-block;
    }
    #nzf-chat-close {
      background: none;
      border: none;
      cursor: pointer;
      color: rgba(255,255,255,0.7);
      padding: 4px;
      display: flex;
      align-items: center;
      transition: color 0.15s;
    }
    #nzf-chat-close:hover { color: #fff; }

    /* Onboarding gate */
    #nzf-chat-gate {
      padding: 24px 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
    }
    .nzf-gate-intro {
      font-size: 14px;
      color: #444;
      line-height: 1.55;
    }
    .nzf-gate-intro strong {
      color: #BE1E2D;
      font-family: 'Bree Serif', serif;
      font-size: 15px;
    }
    .nzf-field-label {
      font-size: 12px;
      font-weight: 600;
      color: #555;
      margin-bottom: 4px;
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .nzf-field-group { display: flex; flex-direction: column; }
    .nzf-input {
      width: 100%;
      padding: 10px 13px;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      color: #333;
      outline: none;
      transition: border-color 0.15s;
    }
    .nzf-input:focus { border-color: #BE1E2D; }
    .nzf-input::placeholder { color: #bbb; }
    .nzf-start-btn {
      width: 100%;
      padding: 11px;
      background: #BE1E2D;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 4px;
    }
    .nzf-start-btn:hover { background: #a01826; }
    .nzf-start-btn:disabled { background: #ccc; cursor: not-allowed; }
    .nzf-gate-error {
      font-size: 12px;
      color: #BE1E2D;
      display: none;
    }

    /* Chat body */
    #nzf-chat-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px 8px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }
    #nzf-chat-body::-webkit-scrollbar { width: 4px; }
    #nzf-chat-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

    .nzf-msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      animation: nzf-msg-in 0.18s ease forwards;
    }
    @keyframes nzf-msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .nzf-msg.nzf-user  { align-self: flex-end; align-items: flex-end; }
    .nzf-msg.nzf-agent { align-self: flex-start; align-items: flex-start; }

    .nzf-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.55;
      white-space: normal;
      word-break: break-word;
    }
    .nzf-user  .nzf-bubble { background: #BE1E2D; color: #fff; border-bottom-right-radius: 4px; }
    .nzf-agent .nzf-bubble { background: #f4f4f5; color: #222; border-bottom-left-radius: 4px; }

    .nzf-msg-time {
      font-size: 10px;
      color: #bbb;
      margin-top: 3px;
      padding: 0 3px;
    }

    /* Typing indicator */
    #nzf-typing {
      display: none;
      align-self: flex-start;
      padding: 10px 16px;
      background: #f4f4f5;
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      gap: 4px;
      align-items: center;
    }
    #nzf-typing.nzf-visible { display: flex; }
    .nzf-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #bbb;
      animation: nzf-bounce 1.1s infinite ease-in-out;
    }
    .nzf-dot:nth-child(2) { animation-delay: 0.18s; }
    .nzf-dot:nth-child(3) { animation-delay: 0.36s; }
    @keyframes nzf-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40%           { transform: translateY(-5px); }
    }

    /* Input area */
    #nzf-chat-input-area {
      padding: 10px 12px 14px;
      border-top: 1px solid #f0f0f0;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }
    #nzf-chat-input {
      flex: 1;
      resize: none;
      border: 1.5px solid #e0e0e0;
      border-radius: 10px;
      padding: 9px 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      color: #333;
      outline: none;
      max-height: 100px;
      line-height: 1.4;
      transition: border-color 0.15s;
    }
    #nzf-chat-input:focus { border-color: #BE1E2D; }
    #nzf-chat-input::placeholder { color: #bbb; }
    #nzf-chat-input:disabled { background: #fafafa; }
    #nzf-chat-send {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      background: #BE1E2D;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    #nzf-chat-send:hover { background: #a01826; }
    #nzf-chat-send:disabled { background: #ddd; cursor: not-allowed; }

    /* Powered-by bar */
    #nzf-chat-footer {
      text-align: center;
      padding: 6px 0 10px;
      font-size: 11px;
      color: #ccc;
      flex-shrink: 0;
    }
    #nzf-chat-footer a { color: #ccc; text-decoration: none; }

    /* Mobile */
    @media (max-width: 440px) {
      #nzf-chat-panel { width: calc(100vw - 24px); right: 12px; bottom: 90px; }
      #nzf-chat-fab   { right: 16px; bottom: 20px; }
    }
  `;

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  // ─── Build DOM ──────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'nzf-chat-fab';
  fab.setAttribute('aria-label', 'Open NZF chat');
  fab.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M4 4h20a2 2 0 012 2v13a2 2 0 01-2 2H9l-5 4V6a2 2 0 012-2z" fill="white"/>
    </svg>`;

  const panel = document.createElement('div');
  panel.id = 'nzf-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'NZF Chat Assistant');
  panel.innerHTML = `
    <div id="nzf-chat-header">
      <div id="nzf-chat-header-avatar">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="8" r="4" fill="white"/>
          <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div id="nzf-chat-header-text">
        <div id="nzf-chat-header-title">NZF Assistant</div>
        <div id="nzf-chat-header-status">
          <span class="nzf-status-dot"></span> Online
        </div>
      </div>
      <button id="nzf-chat-close" aria-label="Close chat">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Onboarding gate -->
    <div id="nzf-chat-gate">
      <p class="nzf-gate-intro">
        <strong>Assalamu Alaikum</strong><br><br>
        Welcome to NZF. I can answer questions about Zakat or help with your application.<br><br>
        To get started, please share your details below.
      </p>
      <div class="nzf-field-group">
        <label class="nzf-field-label" for="nzf-visitor-name">Your name</label>
        <input class="nzf-input" id="nzf-visitor-name" type="text" placeholder="e.g. Ahmed Hassan" autocomplete="name"/>
      </div>
      <div class="nzf-field-group">
        <label class="nzf-field-label" for="nzf-visitor-email">Your email</label>
        <input class="nzf-input" id="nzf-visitor-email" type="email" placeholder="e.g. ahmed@email.com" autocomplete="email"/>
      </div>
      <span class="nzf-gate-error" id="nzf-gate-error">Please enter a valid name and email.</span>
      <button class="nzf-start-btn" id="nzf-start-btn">Start chat</button>
    </div>

    <!-- Chat body (hidden until gate passed) -->
    <div id="nzf-chat-body" style="display:none">
      <div id="nzf-typing">
        <span class="nzf-dot"></span>
        <span class="nzf-dot"></span>
        <span class="nzf-dot"></span>
      </div>
    </div>

    <div id="nzf-chat-input-area" style="display:none">
      <textarea id="nzf-chat-input" rows="1" placeholder="Ask about Zakat…" aria-label="Type your message"></textarea>
      <button id="nzf-chat-send" aria-label="Send message" disabled>
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
          <path d="M1 8.5L16 1l-6 15-2.5-6.5L1 8.5z" fill="white"/>
        </svg>
      </button>
    </div>

    <div id="nzf-chat-footer">Powered by <a href="https://nzf.org.au" target="_blank">NZF Australia</a></div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ─── Helper: timestamp ──────────────────────────────────────────────────
  function nowTime() {
    return new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Helper: append message bubble ─────────────────────────────────────
  function appendMessage(role, text) {
    const body    = document.getElementById('nzf-chat-body');
    const typing  = document.getElementById('nzf-typing');
    const wrapper = document.createElement('div');
    wrapper.className = `nzf-msg ${role === 'user' ? 'nzf-user' : 'nzf-agent'}`;
    wrapper.innerHTML = `
      <div class="nzf-bubble">${linkify(renderMarkdown(escapeHtml(text)))}</div>
      <span class="nzf-msg-time">${nowTime()}</span>`;
    body.insertBefore(wrapper, typing);
    body.scrollTop = body.scrollHeight;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Convert markdown syntax to HTML (runs after escapeHtml, before linkify)
  function renderMarkdown(str) {
    return str
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text* (single asterisk, not part of **)
      .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      // Headings: ### text or ## text → bold line
      .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
      // Bullet points: lines starting with - or •
      .replace(/^[-•]\s+(.+)$/gm, '&bull;&nbsp;$1')
      // Numbered list: 1. text, 2. text etc.
      .replace(/^\d+\.\s+(.+)$/gm, (m, item, offset, str) => {
        const num = m.match(/^(\d+)/)[1];
        return `<span style="display:inline-block;min-width:18px;font-weight:600;">${num}.</span>&nbsp;${item}`;
      })
      // Newlines → line breaks
      .replace(/\n/g, '<br>');
  }

  // Convert plain URLs in escaped text into clickable links
  function linkify(str) {
    // Match http/https URLs (already HTML-escaped, so & is &amp; etc.)
    return str.replace(
      /(https?:\/\/[^\s<>"&]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;opacity:0.9;">$1</a>'
    );
  }

  // ─── Helper: show/hide typing ───────────────────────────────────────────
  function setTyping(show) {
    const t = document.getElementById('nzf-typing');
    const b = document.getElementById('nzf-chat-body');
    t.classList.toggle('nzf-visible', show);
    if (show) b.scrollTop = b.scrollHeight;
  }

  // ─── Helper: disable input ──────────────────────────────────────────────
  function setInputEnabled(enabled) {
    const input = document.getElementById('nzf-chat-input');
    const send  = document.getElementById('nzf-chat-send');
    input.disabled = !enabled;
    send.disabled  = !enabled;
  }

  // ─── Gate: validate + start chat ───────────────────────────────────────
  document.getElementById('nzf-start-btn').addEventListener('click', function () {
    const nameVal  = document.getElementById('nzf-visitor-name').value.trim();
    const emailVal = document.getElementById('nzf-visitor-email').value.trim();
    const errEl    = document.getElementById('nzf-gate-error');
    const emailOk  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);

    if (!nameVal || !emailOk) {
      errEl.style.display = 'block';
      return;
    }

    errEl.style.display = 'none';
    visitorName  = nameVal;
    visitorEmail = emailVal;
    sessionReady = true;

    // Swap gate → chat
    document.getElementById('nzf-chat-gate').style.display       = 'none';
    document.getElementById('nzf-chat-body').style.display        = 'flex';
    document.getElementById('nzf-chat-body').style.flexDirection  = 'column';
    document.getElementById('nzf-chat-input-area').style.display  = 'flex';

    // Greeting
    const greeting = `Wa Alaikum Assalam ${visitorName.split(' ')[0]}! How can I help you today? You can ask me anything about Zakat, or let me know if you have a query about your NZF application.`;
    appendMessage('agent', greeting);
    setInputEnabled(true);
  });

  // Enter key in name/email fields → start
  ['nzf-visitor-name', 'nzf-visitor-email'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('nzf-start-btn').click();
    });
  });

  // ─── Send message ────────────────────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('nzf-chat-input');
    const text  = input.value.trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    appendMessage('user', text);

    chatHistory.push({ role: 'user', content: text });
    isTyping = true;
    setTyping(true);
    setInputEnabled(false);

    // Show "still working" message if response takes more than 10 seconds
    let slowMessageShown = false;
    const slowTimer = setTimeout(() => {
      if (isTyping) {
        slowMessageShown = true;
        appendMessage('agent', "This is taking a little longer than usual — I'm still working on it. Please bear with me for a moment. 🙏");
      }
    }, 10000);

    try {
      const trimmedHistory = chatHistory.slice(-20);

      const res = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages:     trimmedHistory,
          visitorName,
          visitorEmail,
        }),
      });

      clearTimeout(slowTimer);
      const data = await res.json();
      const reply = data.reply || data.error || 'Sorry, something went wrong. Please try again.';
      chatHistory.push({ role: 'assistant', content: reply });
      appendMessage('agent', reply);

    } catch (err) {
      clearTimeout(slowTimer);
      if (!slowMessageShown) {
        appendMessage('agent', 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.');
      } else {
        appendMessage('agent', 'I\'m sorry, that took too long to complete. Please try again, or contact us at **1300 663 729** or **nzf.org.au/contact/**');
      }
    } finally {
      isTyping = false;
      setTyping(false);
      setInputEnabled(true);
      document.getElementById('nzf-chat-input').focus();
    }
  }

  document.getElementById('nzf-chat-send').addEventListener('click', sendMessage);

  document.getElementById('nzf-chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  document.getElementById('nzf-chat-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    document.getElementById('nzf-chat-send').disabled = !this.value.trim() || isTyping;
  });

  // ─── Toggle panel ────────────────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('nzf-open');
    fab.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 3l16 16M19 3L3 19" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    if (sessionReady) {
      setTimeout(() => document.getElementById('nzf-chat-input').focus(), 220);
    } else {
      setTimeout(() => document.getElementById('nzf-visitor-name').focus(), 220);
    }
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('nzf-open');
    fab.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 4h20a2 2 0 012 2v13a2 2 0 01-2 2H9l-5 4V6a2 2 0 012-2z" fill="white"/>
      </svg>`;
  }

  fab.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  document.getElementById('nzf-chat-close').addEventListener('click', closePanel);

  // Close on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closePanel(); });

})();
