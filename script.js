let state = {
  user: null,
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
  speechSynthesis.getVoices();
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
      document.getElementById('api-banner').innerHTML = `${icon('checkCircle')} API Key 已設定，AI 功能已啟用。`;
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
  document.getElementById('api-banner').innerHTML = `${icon('checkCircle')} API Key 已儲存，AI 功能已啟用！`;
  showToast(`API Key 已儲存 ${icon('check')}`);
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
  if (p.themeColor) {
    document.documentElement.style.setProperty('--primary', p.themeColor);
    document.documentElement.style.setProperty('--primary-hover', p.themeColor);
    document.querySelectorAll('.cp').forEach(c => {
      if ((c.getAttribute('style')||'').replace(/background:?\s*/i,'').trim().split(';')[0] === p.themeColor) c.classList.add('active');
    });
  }
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
function doLogout() {
  firebase.auth().signOut().catch(() => {});
  showScreen('screen-login');
}

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
    const contents = isFirst ? messages : [
      ...state.history.map(m => ({role:m.role, parts:[{text:m.content}]})),
      messages[messages.length-1]
    ];
    const body = {
      contents: isFirst ? [{role:'user', parts:[{text:'(start the conversation)'}]}] : contents,
      systemInstruction: {parts:[{text:state.systemPrompt}]},
      generationConfig: {maxOutputTokens:1000}
    };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.text();
      if (err.includes('API_KEY_INVALID')) throw new Error('API Key 無效，請確認是否正確');
      throw new Error(err);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  avatar.innerHTML = role === 'ai' ? icon('robot') : icon('smile');

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
  el.innerHTML = `<div class="fb-head">${icon('star')} AI 建議</div>`;

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
  div.innerHTML = `<div class="avatar">${icon('robot')}</div><div><div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
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
      document.getElementById('mic-btn').innerHTML = icon('mic');
    }
  };
  state.recognition.onerror = () => {
    state.isRecording = false;
    document.getElementById('mic-btn').classList.remove('rec');
    document.getElementById('mic-btn').innerHTML = icon('mic');
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
  document.getElementById('mic-btn').innerHTML = icon('stop');
  document.getElementById('transcript').textContent = '';
  document.getElementById('send-btn').disabled = true;
  try { state.recognition.start(); } catch(e) {}
}

function stopRecognition() {
  if (!state.recognition) return;
  state.isRecording = false;
  document.getElementById('mic-btn').classList.remove('rec');
  document.getElementById('mic-btn').innerHTML = icon('mic');
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
  utter.rate = Math.min(state.speed, 0.9);
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices(); };
  }
  if (voices.length) {
    const accent = (state.prefs.accent || 'American').toLowerCase();
    const langMap = {british:'en-GB', australian:'en-AU'};
    const targetLang = langMap[accent] || 'en-US';
    const preferred = voices.find(v => v.lang === targetLang && (v.name.includes('Enhanced') || v.name.includes('Premium') || v.name.includes('Neural') || v.name.includes('Alex') || v.name.includes('Samantha')));
    const fallback = voices.find(v => v.lang === targetLang);
    utter.voice = preferred || fallback || null;
  }
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
    document.getElementById('vocab-content').innerHTML = `<div class="vocab-empty"><div class="em-icon">${icon('book')}</div><div>輸入單字開始查詢</div></div>`;
    return;
  }
  state.vocabTimer = setTimeout(() => doVocabSearch(), 600);
}

async function doVocabSearch() {
  const word = document.getElementById('vocab-input').value.trim();
  if (!word) return;
  document.getElementById('vocab-content').innerHTML = `<div class="vocab-empty"><div class="em-icon">${icon('clock')}</div><div>查詢中...</div></div>`;
  const result = await lookupWord(word);
  renderVocabResult(result);
}

async function lookupWord(word) {
  let result = null;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      const phonetic = entry.phonetics?.find(p=>p.text)?.text || entry.phonetic || '';
      const synonyms = [...new Set(entry.meanings?.flatMap(m=>m.synonyms||[]) || [])].slice(0,5);
      const meanings = (entry.meanings||[]).flatMap(m =>
        (m.definitions||[]).map(d => ({
          pos: m.partOfSpeech || '',
          definition: d.definition || '',
          translation: ''
        }))
      ).slice(0, 3);
      result = {
        word: entry.word,
        phonetic,
        meanings,
        example: (entry.meanings?.flatMap(m=>m.definitions||[]).find(d=>d.example)?.example) || '',
        synonyms,
        source: 'api'
      };
    }
  } catch(e) {}

  if (state.apiKey && result) {
    const ai = await lookupWordAI(word);
    if (ai && ai.meanings && ai.meanings.length > 0 && !ai.meanings[0].definition.startsWith('查詢失敗')) {
      result.meanings = ai.meanings.slice(0, 3);
      if (ai.example) result.example = ai.example;
      if (ai.synonyms && ai.synonyms.length) result.synonyms = ai.synonyms;
      result.source = 'ai';
    }
  }

  if (result) return result;

  if (state.apiKey) {
    const ai = await lookupWordAI(word);
    if (ai && ai.meanings && ai.meanings.length > 0 && !ai.meanings[0].definition.startsWith('查詢失敗')) {
      return {...ai, source:'ai'};
    }
  }

  return {
    word,
    phonetic: '/.../',
    meanings: [{pos:'', translation:'', definition:`（找不到「${word}」的資料）`}],
    example: '',
    synonyms: [],
    source: 'fallback'
  };
}

async function lookupWordAI(word) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{role:'user', parts:[{text:`Look up the English word: "${word}". Return ONLY valid JSON, no other text:
{
  "word": "...",
  "phonetic": "...",
  "meanings": [
    {"pos":"verb","definition":"English definition","translation":"中文翻譯"},
    {"pos":"noun","definition":"English definition","translation":"中文翻譯"}
  ],
  "example": "ONE natural example sentence",
  "synonyms": ["...","..."]
}
- List up to 3 most common meanings only.
- translation = Traditional Chinese of that specific sense.
- example = exactly ONE sentence.`}]}],
        generationConfig:{maxOutputTokens:800}
      })
    });
    if (!res.ok) return {word, phonetic:'', meanings:[{pos:'',translation:'',definition:'查詢失敗，請稍後再試'}], example:'', synonyms:[], source:'error'};
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return {...JSON.parse(text.match(/\{[\s\S]*\}/)?.[0]||'{}'), source:'ai'};
  } catch(e) {
    return {word, phonetic:'', meanings:[{pos:'',translation:'',definition:'查詢失敗，請稍後再試'}], example:'', synonyms:[], source:'error'};
  }
} 

function renderVocabResult(r) {
  if (!r || !r.word) {
    document.getElementById('vocab-content').innerHTML = `<div class="vocab-empty"><div class="em-icon">${icon('search')}</div><div>找不到這個單字</div></div>`;
    return;
  }
  const alreadySaved = state.words.some(w => w.word.toLowerCase() === r.word.toLowerCase());
  const synHtml = (r.synonyms||[]).map(s=>`<button class="syn-chip" onclick="document.getElementById('vocab-input').value='${escAttr(s)}';doVocabSearch()">${escHtml(s)}</button>`).join('');
  const meaningsHtml = (r.meanings||[]).map(m => `
    <div class="vocab-meaning">
      ${m.pos ? `<span class="vocab-pos">${escHtml(m.pos)}</span>` : ''}
      ${m.translation ? `<div class="vocab-trans">${escHtml(m.translation)}</div>` : ''}
      <div class="vocab-def">${escHtml(m.definition)}</div>
    </div>
  `).join('');
  document.getElementById('vocab-content').innerHTML = `
    <div class="vocab-card">
      <div class="vocab-word">${escHtml(r.word)}</div>
      ${r.phonetic ? `<div class="vocab-phon">${escHtml(r.phonetic)}</div>` : ''}
      <div class="vocab-meanings">${meaningsHtml}</div>
      ${r.example ? `<div class="vocab-ex">"${escHtml(r.example)}"</div>` : ''}
      <div class="vocab-actions">
        <button class="action-btn ${alreadySaved?'saved':''}" id="save-word-btn" onclick="saveWord(${JSON.stringify(JSON.stringify(r))})">
          ${alreadySaved ? `${icon('check')} 已加入單字本` : `${icon('plus')} 加入單字本`}
        </button>
        ${r.example ? `<button class="action-btn" onclick="saveSentence('${escAttr(r.example)}','${escAttr(r.word)} 例句')">${icon('messageCircle')} 收藏例句</button>` : ''}
        <button class="action-btn" onclick="speakText('${escAttr(r.word)}')">${icon('volume')} 發音</button>
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
  state.words.unshift({word:r.word, phonetic:r.phonetic||'', meanings:r.meanings||[], example:r.example||'', synonyms:r.synonyms||[], date:new Date().toLocaleDateString('zh-TW')});
  saveStorage();
  showToast(`「${escHtml(r.word)}」已加入單字本 ${icon('check')}`);
  const btn = document.getElementById('save-word-btn');
  if (btn) { btn.innerHTML = `${icon('check')} 已加入單字本`; btn.classList.add('saved'); }
  renderNotebook();
}

function saveSentence(text, context) {
  if (state.sentences.some(s => s.text === text)) { showToast('已在句子本中'); return; }
  state.sentences.unshift({text, context, date: new Date().toLocaleDateString('zh-TW')});
  saveStorage();
  showToast(`句子已收藏 ${icon('check')}`);
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
      el.innerHTML = `<div class="nb-empty">${icon('book')} 還沒有收藏的單字<br>去單字查詢頁加入吧！</div>`; return;
    }
    el.innerHTML = state.words.map((w,i) => {
      const def = w.meanings ? (w.meanings[0]?.translation || w.meanings[0]?.definition || '') : (w.translation || w.definition || '');
      return `
      <div class="nb-item">
        <div class="nb-body">
          <div class="nb-word">${escHtml(w.word)}</div>
          ${def ? `<div class="nb-def">${escHtml(def)}</div>` : ''}
        </div>
        <div class="nb-actions">
          <button class="nb-icon" onclick="speakText('${escAttr(w.word)}')" title="發音">${icon('volume')}</button>
          <button class="nb-icon" onclick="deleteWord(${i})" title="刪除">${icon('trash')}</button>
        </div>
      </div>
    `}).join('');
  } else {
    if (!state.sentences.length) {
      el.innerHTML = `<div class="nb-empty">${icon('messageCircle')} 還沒有收藏的句子<br>練習或查單字時可以收藏句子</div>`; return;
    }
    el.innerHTML = state.sentences.map((s,i) => `
      <div class="nb-item">
        <div class="nb-body">
          <div class="nb-sent">"${escHtml(s.text)}"</div>
          <div class="nb-meta">${escHtml(s.context)} · ${escHtml(s.date)}</div>
        </div>
        <div class="nb-actions">
          <button class="nb-icon" onclick="deleteSentence(${i})" title="刪除">${icon('trash')}</button>
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
  state.prefs.themeColor = hex;
  saveStorage();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function icon(name) {
  const icons = {
    mic: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect width="16" height="16" x="4" y="4" rx="2"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    notebook: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    messageCircle: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
    target: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    coffee: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    building: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>',
    plane: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
    messageSquare: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    robot: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
    smile: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    volume: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    alertTriangle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    checkCircle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    bookOpen: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  };
  return icons[name] || '';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
