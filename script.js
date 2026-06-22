let state = {
  apiKey: '',
  scenario: 'ordering',
  scenarioLabel: '點餐',
  difficulty: 'intermediate',
  speed: 1.0,
  history: [],
  isRecording: false,
  recognition: null,
  speaking: false,
  words: [],
  sentences: [],
  nbTab: 'words',
  vocabTimer: null,
  lastScreen: 'screen-home',
  prefs: {}
};

const SCENARIO_PROMPTS = {
  ordering:  'You are a friendly waiter/waitress at a nice restaurant. The user is a customer ordering food. Start the conversation naturally.',
  interview: 'You are a professional interviewer at a tech company. The user is the job candidate. Start with a warm greeting and first interview question.',
  workplace: 'You are a colleague at an English-speaking workplace. Have a natural work conversation. Start with a casual greeting.',
  customs:   'You are a customs officer at an international airport. The user is a traveler. Start by asking for their passport and purpose of visit.',
  casual:    'You are a friendly English-speaking person making casual conversation. Be natural, curious, and friendly. Start with a greeting.',
  custom:    ''
};

const DIFFICULTY_LABELS = {beginner:'初級',intermediate:'中級',advanced:'進階'};

window.onload = () => {
  loadFromStorage();
  renderNotebook();
  setupSpeechRecognition();
};

function loadFromStorage() {
  try {
    state.apiKey = localStorage.getItem('su_apikey') || '';
    state.words = JSON.parse(localStorage.getItem('su_words') || '[]');
    state.sentences = JSON.parse(localStorage.getItem('su_sentences') || '[]');
    state.prefs = JSON.parse(localStorage.getItem('su_prefs') || '{}');
    if (state.apiKey) {
      document.getElementById('api-key-input').value = state.apiKey;
      document.getElementById('api-banner').style.background = 'var(--success-bg)';
      document.getElementById('api-banner').style.color = 'var(--success)';
      document.getElementById('api-banner').innerHTML = '✅ API Key 已設定，AI 功能已啟用。';
    }
    applyPrefs();
  } catch(e) {}
}

function saveStorage() {
  try {
    localStorage.setItem('su_words', JSON.stringify(state.words));
    localStorage.setItem('su_sentences', JSON.stringify(state.sentences));
    localStorage.setItem('su_prefs', JSON.stringify(state.prefs));
  } catch(e) {}
}

function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showToast('請輸入 API Key'); return; }
  state.apiKey = key;
  localStorage.setItem('su_apikey', key);
  document.getElementById('api-banner').style.background = 'var(--success-bg)';
  document.getElementById('api-banner').style.color = 'var(--success)';
  document.getElementById('api-banner').innerHTML = '✅ API Key 已儲存，AI 功能已啟用！';
  showToast('API Key 已儲存 ✓');
}

function savePrefs() {
  state.prefs.lang = document.getElementById('pref-lang').value;
  state.prefs.accent = document.getElementById('pref-accent').value;
  state.prefs.diff = document.getElementById('pref-diff').value;
  state.prefs.speed = document.getElementById('pref-speed').value;
  state.prefs.subtitles = document.getElementById('toggle-sub').classList.contains('on');
  state.prefs.feedback = document.getElementById('toggle-feedback').classList.contains('on');
  saveStorage();
}

function applyPrefs() {
  const p = state.prefs;
  if (p.lang) document.getElementById('pref-lang').value = p.lang;
  if (p.accent) document.getElementById('pref-accent').value = p.accent;
  if (p.diff) document.getElementById('pref-diff').value = p.diff;
  if (p.speed) document.getElementById('pref-speed').value = p.speed;
  if (p.subtitles === false) document.getElementById('toggle-sub').classList.remove('on');
  if (p.feedback === false) document.getElementById('toggle-feedback').classList.remove('on');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchTab(btn, screenId) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    if (onclick.includes(screenId)) b.classList.add('active');
  });
  showScreen(screenId);
  if (screenId === 'screen-notebook') renderNotebook();
}

function doLogin() { showScreen('screen-home'); }
function doLogout() { showScreen('screen-login'); }

function selDiff(btn, level) {
  document.querySelectorAll('.diff-chip').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  state.difficulty = level;
}

function selScenario(card, key) {
  document.querySelectorAll('.sc-card').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel');
  state.scenario = key;
  state.scenarioLabel = card.querySelector('span').textContent;
  const ci = document.getElementById('custom-topic');
  ci.style.display = key === 'custom' ? 'block' : 'none';
  if (key === 'custom') setTimeout(() => ci.focus(), 50);
}

function leavePractice() {
  stopSpeech();
  showScreen('screen-home');
}

function startPractice() {
  state.history = [];
  document.getElementById('chat-wrap').innerHTML = '';
  document.getElementById('transcript').textContent = '';
  document.getElementById('send-btn').disabled = true;
  document.getElementById('tag-scenario').textContent = state.scenarioLabel;
  document.getElementById('tag-diff').textContent = DIFFICULTY_LABELS[state.difficulty];
  showScreen('screen-practice');
  initConversation();
}

async function initConversation() {
  const customTopic = document.getElementById('custom-topic').value.trim();
  let sysPrompt = SCENARIO_PROMPTS[state.scenario] || SCENARIO_PROMPTS.casual;
  if (state.scenario === 'custom' && customTopic) {
    sysPrompt = `You are having a conversation in this scenario: ${customTopic}. Start naturally.`;
  }

  const diffInstructions = {
    beginner: 'Use simple vocabulary, short sentences, and speak slowly. If the user makes grammar mistakes, gently correct them.',
    intermediate: 'Use natural conversational English. Point out significant grammar issues and offer better phrasing.',
    advanced: 'Use natural, complex English with idioms. Challenge the user with follow-up questions. Correct subtle errors.'
  };

  state.systemPrompt = `${sysPrompt}\n\nDifficulty level: ${state.difficulty}. ${diffInstructions[state.difficulty]}\n\nAfter each user message, provide your conversational reply. Then on a new line starting with "---FEEDBACK---", give brief feedback in this JSON format: {"corrections":[{"original":"...","better":"...","note":"..."}],"alternatives":["phrase 1","phrase 2"],"praise":"one positive thing if any"}\n\nIf no corrections needed, use empty array. Keep feedback concise.`;

  showTyping();
  const firstMsg = await callAI([{role:'user', content:'(start the conversation)'}], true);
  removeTyping();
  if (firstMsg) {
    const {reply} = parseAIResponse(firstMsg);
    appendMsg('ai', reply);
    state.history.push({role:'assistant', content: reply});
    if (document.getElementById('toggle-sub').classList.contains('on')) speakText(reply);
  }
}

async function callAI(messages, isFirst=false) {
  if (!state.apiKey) {
    return demoResponse(isFirst);
  }
  try {
    const msgs = isFirst ? messages : [
      ...state.history.map(m => ({role:m.role, content:m.content})),
      messages[messages.length-1]
    ];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: state.systemPrompt,
        messages: msgs
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch(e) {
    console.error(e);
    return demoResponse(isFirst);
  }
}

function demoResponse(isFirst) {
  const demos = {
    ordering: [
      "Hi there! Welcome to The Maple Bistro. I'll be your server today. Can I start you off with something to drink?",
      "Great choice! Are you ready to order your main course, or would you like to hear our specials?",
      "Excellent! Our chef's special today is a pan-seared salmon with lemon butter sauce. Would you like to add a side salad?",
    ],
    interview: [
      "Good morning! Thanks for coming in today. I'm Sarah, the hiring manager. Could you start by telling me a little about yourself?",
      "That's impressive! Could you tell me about a challenging project you've worked on and how you handled it?",
      "Great example! Where do you see yourself in five years?",
    ],
    casual: [
      "Hey! How's your day going so far?",
      "Oh nice! I've been pretty busy myself. Have you done anything fun lately?",
      "That sounds great! I've been meaning to try something new too. Any recommendations?",
    ]
  };
  const arr = demos[state.scenario] || demos.casual;
  const idx = state.history.filter(h=>h.role==='assistant').length;
  const reply = arr[Math.min(idx, arr.length-1)];
  return `${reply}\n---FEEDBACK---\n{"corrections":[],"alternatives":[],"praise":"Keep it up!"}`;
}

function parseAIResponse(raw) {
  const parts = raw.split('---FEEDBACK---');
  const reply = parts[0].trim();
  let feedback = null;
  if (parts[1]) {
    try {
      feedback = JSON.parse(parts[1].trim());
    } catch(e) {}
  }
  return {reply, feedback};
}

async function sendUserMsg() {
  const el = document.getElementById('transcript');
  const text = el.textContent.trim();
  if (!text) return;

  stopRecognition();
  el.textContent = '';
  document.getElementById('send-btn').disabled = true;

  appendMsg('user', text);
  state.history.push({role:'user', content: text});

  showTyping();
  const raw = await callAI([{role:'user', content: text}]);
  removeTyping();

  const {reply, feedback} = parseAIResponse(raw);
  state.history.push({role:'assistant', content: reply});

  const showFeedback = document.getElementById('toggle-feedback').classList.contains('on');
  appendMsg('ai', reply, showFeedback ? feedback : null);
  if (document.getElementById('toggle-sub').classList.contains('on')) speakText(reply);
}

function appendMsg(role, text, feedback=null) {
  const wrap = document.getElementById('chat-wrap');
  const div = document.createElement('div');
  div.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'ai' ? '🤖' : '😊';

  const inner = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  inner.appendChild(bubble);

  if (feedback && role === 'ai') {
    const fb = buildFeedbackEl(feedback);
    if (fb) inner.appendChild(fb);
  }
  if (feedback && role !== 'ai') {
    const fb = buildFeedbackEl(feedback);
    if (fb) inner.appendChild(fb);
  }

  div.appendChild(avatar);
  div.appendChild(inner);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function buildFeedbackEl(fb) {
  if (!fb) return null;
  const corrections = fb.corrections || [];
  const alts = fb.alternatives || [];
  if (!corrections.length && !alts.length && !fb.praise) return null;

  const el = document.createElement('div');
  el.className = 'feedback';
  el.innerHTML = `<div class="fb-head">✨ AI 建議</div>`;

  if (fb.praise) {
    el.innerHTML += `<div class="fb-row"><div class="fb-dot ok"></div><span style="color:var(--success)">${escHtml(fb.praise)}</span></div>`;
  }
  for (const c of corrections) {
    el.innerHTML += `<div class="fb-row"><div class="fb-dot warn"></div><span>「${escHtml(c.original)}」→ <strong>${escHtml(c.better)}</strong>：${escHtml(c.note||'')}</span></div>`;
  }
  if (alts.length) {
    const altHtml = alts.map(a => `<button class="alt-chip" onclick="useAlt('${escAttr(a)}')">${escHtml(a)}</button>`).join('');
    el.innerHTML += `<div style="margin-top:6px"><div style="font-size:12px;color:var(--text3);margin-bottom:4px">更道地的說法：</div><div class="alts">${altHtml}</div></div>`;
  }
  return el;
}

function useAlt(text) {
  const el = document.getElementById('transcript');
  el.textContent = text;
  document.getElementById('send-btn').disabled = false;
  el.focus();
}

function showTyping() {
  const wrap = document.getElementById('chat-wrap');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="avatar">🤖</div><div><div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  state.recognition = new SR();
  state.recognition.lang = 'en-US';
  state.recognition.continuous = false;
  state.recognition.interimResults = true;
  state.recognition.onresult = (e) => {
    const el = document.getElementById('transcript');
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    el.textContent = transcript;
    document.getElementById('send-btn').disabled = !transcript.trim();
  };
  state.recognition.onend = () => {
    if (state.isRecording) {
      state.isRecording = false;
      document.getElementById('mic-btn').classList.remove('rec');
      document.getElementById('mic-btn').textContent = '🎙️';
    }
  };
  state.recognition.onerror = () => {
    state.isRecording = false;
    document.getElementById('mic-btn').classList.remove('rec');
    document.getElementById('mic-btn').textContent = '🎙️';
  };
}

function toggleMic() {
  if (state.isRecording) {
    stopRecognition();
  } else {
    startRecognition();
  }
}

function startRecognition() {
  if (!state.recognition) { showToast('此瀏覽器不支援語音輸入'); return; }
  state.isRecording = true;
  document.getElementById('mic-btn').classList.add('rec');
  document.getElementById('mic-btn').textContent = '⏹️';
  document.getElementById('transcript').textContent = '';
  document.getElementById('send-btn').disabled = true;
  try { state.recognition.start(); } catch(e) {}
}

function stopRecognition() {
  if (!state.recognition) return;
  state.isRecording = false;
  document.getElementById('mic-btn').classList.remove('rec');
  document.getElementById('mic-btn').textContent = '🎙️';
  try { state.recognition.stop(); } catch(e) {}
}

function onTranscriptInput() {
  const el = document.getElementById('transcript');
  document.getElementById('send-btn').disabled = !el.textContent.trim();
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  stopSpeech();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = state.speed;
  const accent = (state.prefs.accent || 'American').toLowerCase();
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => {
    if (accent === 'british') return v.lang === 'en-GB';
    if (accent === 'australian') return v.lang === 'en-AU';
    return v.lang === 'en-US';
  });
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function setSpeed(btn, val) {
  document.querySelectorAll('.spd').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.speed = val;
}

function handleVocabInput(val) {
  clearTimeout(state.vocabTimer);
  if (!val.trim()) {
    document.getElementById('vocab-content').innerHTML = '<div class="vocab-empty"><div class="em-icon">📚</div><div>輸入單字開始查詢</div></div>';
    return;
  }
  state.vocabTimer = setTimeout(() => doVocabSearch(), 600);
}

async function doVocabSearch() {
  const word = document.getElementById('vocab-input').value.trim();
  if (!word) return;
  document.getElementById('vocab-content').innerHTML = '<div class="vocab-empty"><div class="em-icon">⏳</div><div>查詢中...</div></div>';
  const result = await lookupWord(word);
  renderVocabResult(result);
}

async function lookupWord(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      const meanings = entry.meanings || [];
      const firstMeaning = meanings[0] || {};
      const def = firstMeaning.definitions?.[0] || {};
      const phonetic = entry.phonetics?.find(p=>p.text)?.text || entry.phonetic || '';
      const synonyms = [...new Set([
        ...(firstMeaning.synonyms||[]),
        ...(def.synonyms||[])
      ])].slice(0,5);
      return {
        word: entry.word,
        phonetic,
        pos: firstMeaning.partOfSpeech || '',
        definition: def.definition || '',
        example: def.example || '',
        synonyms,
        source: 'api'
      };
    }
  } catch(e) {}

  if (state.apiKey) {
    return await lookupWordAI(word);
  }

  return {
    word,
    phonetic: '/.../',
    pos: 'adjective',
    definition: `（找不到「${word}」的資料，請確認拼字或設定 API Key 使用 AI 查詢）`,
    example: '',
    synonyms: [],
    source: 'fallback'
  };
}

async function lookupWordAI(word) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:600,
        messages:[{role:'user', content:`Look up the English word: "${word}". Return ONLY valid JSON with this exact structure, no other text: {"word":"...","phonetic":"...","pos":"...","definition":"...","example":"...","synonyms":["...","..."]}`}]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    return {...JSON.parse(text.match(/\{[\s\S]*\}/)?.[0]||'{}'), source:'ai'};
  } catch(e) {
    return {word, phonetic:'', pos:'', definition:'查詢失敗，請稍後再試', example:'', synonyms:[], source:'error'};
  }
}

function renderVocabResult(r) {
  if (!r || !r.word) {
    document.getElementById('vocab-content').innerHTML = '<div class="vocab-empty"><div class="em-icon">😕</div><div>找不到這個單字</div></div>';
    return;
  }
  const alreadySaved = state.words.some(w => w.word.toLowerCase() === r.word.toLowerCase());
  const synHtml = (r.synonyms||[]).map(s=>`<button class="syn-chip" onclick="document.getElementById('vocab-input').value='${escAttr(s)}';doVocabSearch()">${escHtml(s)}</button>`).join('');
  document.getElementById('vocab-content').innerHTML = `
    <div class="vocab-card">
      <div class="vocab-word">${escHtml(r.word)}</div>
      ${r.phonetic ? `<div class="vocab-phon">${escHtml(r.phonetic)}</div>` : ''}
      ${r.pos ? `<span class="vocab-pos">${escHtml(r.pos)}</span>` : ''}
      <div class="vocab-def">${escHtml(r.definition)}</div>
      ${r.example ? `<div class="vocab-ex">"${escHtml(r.example)}"</div>` : ''}
      <div class="vocab-actions">
        <button class="action-btn ${alreadySaved?'saved':''}" id="save-word-btn" onclick="saveWord(${JSON.stringify(JSON.stringify(r))})">
          ${alreadySaved ? '✅ 已加入單字本' : '📖 加入單字本'}
        </button>
        ${r.example ? `<button class="action-btn" onclick="saveSentence('${escAttr(r.example)}','單字查詢')">💬 收藏例句</button>` : ''}
        <button class="action-btn" onclick="speakText('${escAttr(r.word)}')">🔊 發音</button>
      </div>
      ${synHtml ? `<div class="syn-section"><div class="syn-label">同義詞</div><div class="syn-chips">${synHtml}</div></div>` : ''}
    </div>
  `;
}

function saveWord(rJson) {
  const r = JSON.parse(rJson);
  if (state.words.some(w => w.word.toLowerCase() === r.word.toLowerCase())) {
    showToast('已在單字本中'); return;
  }
  state.words.unshift({word:r.word, phonetic:r.phonetic||'', definition:r.definition||'', example:r.example||'', synonyms:r.synonyms||[], date:new Date().toLocaleDateString('zh-TW')});
  saveStorage();
  showToast(`「${r.word}」已加入單字本 ✓`);
  const btn = document.getElementById('save-word-btn');
  if (btn) { btn.textContent = '✅ 已加入單字本'; btn.classList.add('saved'); }
  renderNotebook();
}

function saveSentence(text, context) {
  if (state.sentences.some(s => s.text === text)) { showToast('已在句子本中'); return; }
  state.sentences.unshift({text, context, date: new Date().toLocaleDateString('zh-TW')});
  saveStorage();
  showToast('句子已收藏 ✓');
  renderNotebook();
}

function switchNbTab(btn, tab) {
  document.querySelectorAll('.nb-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.nbTab = tab;
  renderNotebook();
}

function renderNotebook() {
  const el = document.getElementById('nb-content');
  if (!el) return;
  if (state.nbTab === 'words') {
    if (!state.words.length) {
      el.innerHTML = '<div class="nb-empty">📖 還沒有收藏的單字<br>去單字查詢頁加入吧！</div>'; return;
    }
    el.innerHTML = state.words.map((w,i) => `
      <div class="nb-item">
        <div class="nb-body">
          <div class="nb-word">${escHtml(w.word)}</div>
          <div class="nb-def">${escHtml(w.definition)}</div>
        </div>
        <div class="nb-actions">
          <button class="nb-icon" onclick="speakText('${escAttr(w.word)}')" title="發音">🔊</button>
          <button class="nb-icon" onclick="deleteWord(${i})" title="刪除">🗑️</button>
        </div>
      </div>
    `).join('');
  } else {
    if (!state.sentences.length) {
      el.innerHTML = '<div class="nb-empty">💬 還沒有收藏的句子<br>練習或查單字時可以收藏句子</div>'; return;
    }
    el.innerHTML = state.sentences.map((s,i) => `
      <div class="nb-item">
        <div class="nb-body">
          <div class="nb-sent">"${escHtml(s.text)}"</div>
          <div class="nb-meta">${escHtml(s.context)} · ${escHtml(s.date)}</div>
        </div>
        <div class="nb-actions">
          <button class="nb-icon" onclick="deleteSentence(${i})" title="刪除">🗑️</button>
        </div>
      </div>
    `).join('');
  }
}

function deleteWord(i) {
  state.words.splice(i,1); saveStorage(); renderNotebook(); showToast('已刪除');
}
function deleteSentence(i) {
  state.sentences.splice(i,1); saveStorage(); renderNotebook(); showToast('已刪除');
}

function setColor(hex, el) {
  document.querySelectorAll('.cp').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.documentElement.style.setProperty('--primary', hex);
  document.documentElement.style.setProperty('--primary-hover', hex);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
