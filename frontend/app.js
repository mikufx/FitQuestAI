/* =========================================================================
   FITQUEST AI — prototype application logic
   All state lives in memory only (no localStorage per artifact sandbox rules).
   ========================================================================= */

/* ---------------- Utility ---------------- */
function el(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function rand(min,max){return Math.random()*(max-min)+min;}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function uid(){return 'id'+Math.random().toString(36).slice(2,9);}

/* ================= THEME (Display Preference: Dark / Light) ================= */
function getTheme(){
  try{ return localStorage.getItem('fitquest_theme') || ((state && state.profile && state.profile.theme) || 'dark'); }
  catch(e){ return (state && state.profile && state.profile.theme) || 'dark'; }
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t==='light' ? 'light' : 'dark');
  document.querySelectorAll('.theme-seg button').forEach(b=>b.classList.toggle('on', b.dataset.theme===t));
  try{ const pb = document.getElementById('theme-pill-btn'); if(pb) pb.textContent = t==='light' ? '☀️' : '🌙'; }catch(e){}
}
function setTheme(t){
  t = (t==='light') ? 'light' : 'dark';
  try{ localStorage.setItem('fitquest_theme', t); }catch(e){}
  if(state){ state.theme=t; if(state.profile) state.profile.theme=t; }
  applyTheme(t);
  try{ syncUserRecord(); persistUsersRegistry(); saveStateToStorage(); apiSyncProfile(); }catch(e){}
}
function initTheme(){
  let t='dark';
  try{ t = localStorage.getItem('fitquest_theme') || t; }catch(e){}
  // Per-user override (restored profile wins after login)
  try{ if(state && state.profile && state.profile.theme) t = state.profile.theme; }catch(e){}
  applyTheme(t);
}
initTheme();

/* ---- Topbar pill: theme toggle + suggestion box ---- */
function syncThemePillBtn(){
  const b = el('theme-pill-btn');
  if(b) b.textContent = getTheme()==='light' ? '☀️' : '🌙';
}
function toggleThemePill(){
  setTheme(getTheme()==='light' ? 'dark' : 'light');
  syncThemePillBtn();
  closeProfileMenu(); hideSuggestPopup();
}
function hideSuggestPopup(){ const p=el('suggest-popup'); if(p) p.classList.add('hidden'); }
function toggleSuggestPopup(){
  const p = el('suggest-popup');
  if(!p) return;
  const willOpen = p.classList.contains('hidden');
  if(willOpen) closeProfileMenu();
  p.classList.toggle('hidden');
  if(!p.classList.contains('hidden')) renderSuggestList();
}
function renderSuggestList(){
  const list = state.suggestions||[];
  const holder = el('suggest-list');
  if(!holder) return;
  holder.innerHTML = !list.length
    ? `<div class="small-muted" style="text-align:center;padding:10px 0 2px;">No suggestions yet — be the first!</div>`
    : list.slice(0,5).map(s=>`<div class="suggest-item">${esc(s.text)}<br><b>${new Date(s.at).toLocaleDateString()}</b></div>`).join('');
}
function submitSuggestion(){
  const inp = el('suggest-input');
  const val = (inp.value||'').trim();
  if(!val){ toast('<b>Write something first</b><br>Tell us what to add or improve.'); return; }
  state.suggestions = state.suggestions||[];
  state.suggestions.unshift({text:val, at:Date.now()});
  if(state.suggestions.length>30) state.suggestions = state.suggestions.slice(0,30);
  try{ saveStateToStorage(); }catch(e){}
  inp.value='';
  renderSuggestList();
  toast('<b>🙏 Thanks for the suggestion!</b><br>Saved to your feedback list.');
  // Also email it to the team via backend (Resend). Local copy above is the offline fallback.
  try{
    if(typeof apiReq==='function' && typeof apiToken==='function' && apiToken()){
      apiReq('/api/suggestions',{method:'POST',body:{text:val}}).then(out=>{
        if(out && out.mailed) toast('<b>📧 Sent to our team!</b><br>We got your suggestion by email.');
      }).catch(()=>{});
    }
  }catch(e){}
}

/* ---- Topbar profile avatar dropdown: Profile / Forget Password / Logout ---- */
function toggleProfileMenu(){
  const d = el('profile-dropdown');
  if(!d) return;
  if(d.classList.contains('open')){ closeProfileMenu(); return; }
  hideSuggestPopup();
  renderProfileDropMain();
  d.classList.add('open');
}
function closeProfileMenu(){ const d=el('profile-dropdown'); if(d) d.classList.remove('open'); }
document.addEventListener('click', function(e){
  const d = el('profile-dropdown');
  if(d && d.classList.contains('open') && !e.target.closest('#profile-menu-wrap')) closeProfileMenu();
  const sp = el('suggest-popup');
  if(sp && !sp.classList.contains('hidden') && !e.target.closest('#suggest-popup') && !e.target.closest('#suggest-pill-btn')) sp.classList.add('hidden');
});
function renderProfileDropMain(){
  const dd = el('profile-dropdown'); if(!dd) return;
  dd.innerHTML = `
    <div class="profile-drop-head">
      <div style="font-weight:800;font-size:14px;">${esc(state.currentUser?state.currentUser.name:'Athlete')}</div>
      <div class="small-muted">${esc(state.currentUser?state.currentUser.email:'')}</div>
    </div>
    <button class="profile-drop-item" onclick="closeProfileMenu();setView('profile')">👤&nbsp; Profile</button>
    <button class="profile-drop-item" onclick="closeProfileMenu();forgotStep=1;setView('forgot')">🔑&nbsp; Forget Password</button>
    <button class="profile-drop-item" style="color:var(--coral);" onclick="closeProfileMenu();setView('delete')">🗑️&nbsp; Delete Account</button>
    <button class="profile-drop-item" onclick="doLogout()">🚪&nbsp; Logout</button>`;
}
/* ---- Cursor-proximity glow tracking (one passive listener for all cards) ---- */
document.addEventListener('mousemove', function(e){
  const card = e.target && e.target.closest ? e.target.closest('.ex-card,.chal-card,.stat-tile,.macro-card,.xp-store-item,.pick-card,.plan-card,.lb-row,.meal-item,.premium-ex-row') : null;
  if(!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', (e.clientX-r.left)+'px');
  card.style.setProperty('--my', (e.clientY-r.top)+'px');
}, {passive:true});

/* Show "working" on any button: darkens + 3 white dots glowing 1-by-1. Always
   paired with restore — pass the same button to setBtnLoading(btn,false). */
function setBtnLoading(btn, on){
  if(!btn || !btn.classList) return;
  if(on){
    if(btn.dataset.orig==null) btn.dataset.orig = btn.innerHTML;
    btn.classList.add('loading'); btn.disabled = true;
    // Fade the label out first, then fade the dots in — never both at once.
    btn.innerHTML = '<span class="btn-fade">' + btn.dataset.orig + '</span>';
    void btn.offsetWidth;
    const label = btn.querySelector('.btn-fade');
    setTimeout(()=>{
      if(!btn.classList.contains('loading')) return; // already restored
      btn.innerHTML = '<span class="tdots fade-in"><i></i><i></i><i></i></span>';
    }, label ? 180 : 0);
    if(label) label.classList.add('out');
  } else {
    btn.classList.remove('loading'); btn.disabled = false;
    if(btn.dataset.orig!=null){ btn.innerHTML = btn.dataset.orig; delete btn.dataset.orig; }
  }
}

function toast(html){
  const t=document.createElement('div');
  t.className='toast';
  t.innerHTML=html;
  el('toast-wrap').appendChild(t);
  setTimeout(()=>{t.classList.add('out');t.style.opacity='0';t.style.transform='translateX(24px) scale(.95)';setTimeout(()=>t.remove(),300);},3200);
}

/* ---- Global bounce-on-click for interactive elements ---- */
document.addEventListener('click', function(e){
  const target = e.target.closest('button, .chip, .pick-card, .filter-chip, .nav-item, .auth-back-btn, .ex-card .btn, .badge-pill, .ex-card, .chal-card, .stat-tile, .macro-card, .xp-store-item, .plan-card, .lb-row, .meal-item, .premium-ex-row .btn');
  if(!target) return;
  // Don't bounce disabled buttons
  if(target.disabled || target.getAttribute('disabled')!=null) return;
  target.classList.remove('bounce-tap');
  void target.offsetWidth; // reflow to restart animation
  target.classList.add('bounce-tap');
  target.addEventListener('animationend', ()=> target.classList.remove('bounce-tap'), {once:true});
}, true);

/* ================= BACKEND API LAYER (FastAPI, localStorage fallback) =================
   Set window.FITQUEST_API_BASE before load to override, e.g.:
     localStorage.setItem('fitquest_api_base','http://127.0.0.1:8000')
   All calls fail soft -> local mode keeps working offline. */
const API_BASE = (window.FITQUEST_API_BASE || localStorage.getItem('fitquest_api_base') || (((location.protocol||'').indexOf('http')===0) ? location.origin : 'http://127.0.0.1:8000')).replace(/\/$/,'');
function apiToken(){ return localStorage.getItem('fitquest_token')||null; }
function apiSetToken(t){ if(t) localStorage.setItem('fitquest_token',t); else localStorage.removeItem('fitquest_token'); }

/* ================= GOOGLE SIGN-IN (Supabase Auth) =================
   Dual auth: classic email-code JWT (apiToken) + Google via Supabase.
   Google flow: OAuth redirect -> Supabase session -> exchange the Supabase
   access token for a FitQuest token at /api/auth/supabase. Downstream code
   keeps using apiToken() unchanged.
   Overrides: window.FITQUEST_SUPABASE_URL / localStorage fitquest_supabase_url (+ _anon). */
const SUPABASE_URL = (window.FITQUEST_SUPABASE_URL || localStorage.getItem('fitquest_supabase_url') || 'https://ifzbhdrchypgorcgojzb.supabase.co').replace(/\/$/,'');
const SUPABASE_ANON_KEY = (window.FITQUEST_SUPABASE_ANON_KEY || localStorage.getItem('fitquest_supabase_anon') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmemJoZHJjaHlwZ29yY2dvanpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzM0OTEsImV4cCI6MjEwNTkwOTQ5MX0.OUQJDHVGdQhXdLMHtSIufWqM7u7Cd8afEyqNzmkCLAI');
let _sbClient = null;
function sbClient(){
  if(_sbClient) return _sbClient;
  if(!window.supabase || !window.supabase.createClient) return null;
  try{ _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
  catch(e){ return null; }
  return _sbClient;
}
async function doGoogleLogin(btn){
  const sb = sbClient();
  if(!sb){ toast('<b>Google sign-in unavailable</b><br>Check your connection and reload.'); return; }
  if(btn) setBtnLoading(btn, true);
  try{
    const {error} = await sb.auth.signInWithOAuth({provider:'google', options:{redirectTo: location.origin}});
    if(error) throw error;
    // Redirects to Google; continuation runs in handleGoogleCallback() on return.
  }catch(e){
    toast('<b>Google sign-in failed</b><br>'+esc(String((e&&e.message)||e).slice(0,140)));
    if(btn) setBtnLoading(btn,false);
  }
}
async function exchangeSupabaseToken(sbToken){
  const out = await apiReq('/api/auth/supabase',{method:'POST',body:{access_token:sbToken},timeoutMs:15000});
  if(!(out && out.access_token)) throw new Error('Exchange failed');
  apiSetToken(out.access_token);
  const me = await apiFetchMe();
  if(me && me.email){
    state.currentUser = {name: me.name, email: me.email};
    try{ localStorage.setItem('fitquest_session', me.email); }catch(e){}
    await hydrateFromServer();
    requireProfileOrEnter(me);
    return true;
  }
  return false;
}
async function handleGoogleCallback(){
  const sb = sbClient();
  if(!sb) return false;
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(session && session.access_token){
      try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
      showGoogleLoading(); // yellow glowing circle so users know sign-in is working
      try{
        await exchangeSupabaseToken(session.access_token);
      }catch(e){
        toast('<b>Google sign-in incomplete</b><br>'+esc(prettyAuthError(String((e&&e.message)||e))));
      }
      hideGoogleLoading();
      try{ await sb.auth.signOut(); }catch(e){} // FitQuest token owns the session from here
      return true;
    }
  }catch(e){ /* not a Google return visit — fall through to normal login */ }
  return false;
}
function showGoogleLoading(){
  let ov = el('google-loading');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'google-loading';
    ov.innerHTML = `<div class="gl-box"><div class="gl-spinner"></div><div class="gl-msg">Signing you in with Google…</div><div class="gl-sub">Finishing up, one moment.</div></div>`;
    document.body.appendChild(ov);
  }
  ov.classList.add('open');
}
function hideGoogleLoading(){ const ov = el('google-loading'); if(ov) ov.classList.remove('open'); }
const GOOGLE_BTN_HTML = `<div class="divider">or</div><button class="btn-google" onclick="doGoogleLogin(this)"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</button>`;
async function apiReq(path, opts){
  opts = opts||{};
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const tok = apiToken();
  if(tok) headers['Authorization'] = 'Bearer '+tok;
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), opts.timeoutMs||6000);
  try{
    const res = await fetch(API_BASE+path, {method:opts.method||'GET', headers, body:opts.body?JSON.stringify(opts.body):undefined, signal:ctrl.signal});
    if(!res.ok){ const txt = await res.text().catch(()=> ''); throw new Error(res.status+' '+txt.slice(0,160)); }
    const ct = res.headers.get('content-type')||'';
    return ct.includes('json') ? res.json() : res.text();
  } finally { clearTimeout(timer); }
}
async function apiSignupRemote(name,email,password){
  // 201, no token yet — email verification comes first
  // Generous timeout: code-email sending can take several seconds.
  const out = await apiReq('/api/auth/signup',{method:'POST',body:{name,email,password},timeoutMs:25000});
  if(out && out.access_token) apiSetToken(out.access_token);
  return out;
}
async function apiVerifyRemote(email,code){
  const out = await apiReq('/api/auth/verify',{method:'POST',body:{email,code}});
  if(out && out.access_token) apiSetToken(out.access_token);
  return out;
}
// Email-verification screen (backend accounts only)
let pendingVerifyEmail = null;
function renderVerifyScreen(email, note){
  pendingVerifyEmail = email;
  el('auth-card-holder').innerHTML = `
    <div class="auth-card">
      <button class="auth-back-btn" onclick="renderAuthLogin()">← Back to Login</button>
      <h2 class="display">Check your email</h2>
      <div class="sub">We sent a 6-digit code to <b>${esc(email)}</b>. It expires in 20 minutes.</div>
      ${note ? `<div class="err-box" style="margin-bottom:12px;">${note}</div>` : ''}
      <div id="verify-dev-note"></div>
      <div class="field"><label>Verification code</label><input id="vf-code" inputmode="numeric" maxlength="6" placeholder="••••••" style="text-align:center;font-size:22px;letter-spacing:6px;"></div>
      <button class="btn btn-volt btn-block" onclick="doVerify(this)">Verify & Continue</button>
      <div class="auth-links">
        <span>Didn't get it?</span>
        <button id="vf-resend" onclick="doResendCode()">Resend code</button>
      </div>
    </div>`;
  const inp = el('vf-code');
  if(inp){ inp.focus(); inp.addEventListener('keydown', e=>{ if(e.key==='Enter') doVerify(); }); }
}
async function doVerify(btn){
  const email = pendingVerifyEmail || '';
  const code = (el('vf-code')||{}).value || '';
  if(code.trim().length<4){ toast('<b>Enter the code</b><br>Check your email inbox.'); return; }
  setBtnLoading(btn, true);
  try{
    await apiVerifyRemote(email, code.trim());
    const me = await apiFetchMe();
    state.currentUser = {name:(me&&me.name)||email.split('@')[0], email};
    if(me && me.profile) state.profile = me.profile;
    await hydrateFromServer();
    toast('<b>Email verified</b><br>Welcome to FitQuest AI!');
    requireProfileOrEnter(me);
  }catch(e){
    toast('<b>Verification failed</b><br>'+esc(prettyAuthError((e&&e.message)||e)));
    setBtnLoading(btn,false);
  }
}
async function doResendCode(){
  const email = pendingVerifyEmail || '';
  const btn = el('vf-resend');
  setBtnLoading(btn, true);
  try{
    const out = await apiReq('/api/auth/resend-code',{method:'POST',body:{email}});
    if(out && out.dev_code) showDevCode(out.dev_code);
    toast('<b>Code resent</b><br>Check your email.');
  }catch(e){
    toast('<b>Resend failed</b><br>'+esc(prettyAuthError((e&&e.message)||e)));
  }finally{
    // 45s server cooldown — mirror it client-side
    let s = 45;
    const tick = ()=>{
      if(!el('vf-resend')) return;
      if(s<=0){ el('vf-resend').disabled = false; el('vf-resend').textContent = 'Resend code'; return; }
      el('vf-resend').textContent = 'Resend in '+s+'s';
      s--; setTimeout(tick, 1000);
    };
    tick();
  }
}
function showDevCode(code){
  const holder = el('verify-dev-note');
  if(holder) holder.innerHTML = `<div class="err-box" style="margin-bottom:12px;border-color:var(--blue);">Email delivery unavailable here — your code is <b>${esc(code)}</b></div>`;
}
function prettyAuthError(msg){
  // Turn backend/FastAPI error blobs into one human-readable line.
  const m = String(msg||'');
  if(/testing emails/i.test(m)) return 'Resend test mode: codes only reach your Resend account inbox. Use that address, or verify a domain in Resend.';
  const i = m.indexOf('{');
  if(i>=0){
    try{
      const o = JSON.parse(m.slice(i));
      let d = String(o.detail||'');
      const j = d.indexOf('{');
      if(j>=0){ try{ const inner = JSON.parse(d.slice(j)); if(inner.message) return String(inner.message).slice(0,220); }catch(e){} }
      if(d) return d.slice(0,220);
    }catch(e){}
  }
  return m.replace(/^\d+\s*/, '').slice(0,220) || 'Something went wrong. Try again.';
}
async function apiLoginRemote(email,password){
  const out = await apiReq('/api/auth/login',{method:'POST',body:{email,password}});
  if(out && out.access_token) apiSetToken(out.access_token);
  return out;
}
async function apiFetchMe(){
  try{ return await apiReq('/api/auth/me'); }catch(e){ return null; }
}
function apiAvailable(){ return !!apiToken(); }
// Fire-and-forget syncs — never block UI, never throw.
// Failed requests go to a local outbox and are retried when back online,
// so a 1-second (or 1-minute) internet blip never loses a workout/meal.
const OUTBOX_KEY='fitquest_outbox';
function outboxPush(type,payload){
  try{
    const q=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');
    q.push({type,payload,ts:Date.now()});
    localStorage.setItem(OUTBOX_KEY,JSON.stringify(q.slice(-50))); // cap at 50
  }catch(e){}
}
function apiSyncProfile(){ const p=state.profile||{}; apiReq('/api/users/me/profile',{method:'PUT',body:p}).catch(()=>outboxPush('profile',p)); }
function apiSyncWorkout(payload){ apiReq('/api/workouts',{method:'POST',body:payload}).catch(()=>outboxPush('workout',payload)); }
function apiSyncMeal(payload){ apiReq('/api/nutrition/log',{method:'POST',body:payload}).catch(()=>outboxPush('meal',payload)); }
function apiSyncChallenge(id){ apiReq('/api/challenges/'+id+'/progress',{method:'POST'}).catch(()=>outboxPush('challenge',{id})); }
async function flushOutbox(){
  if(!apiToken()) return;
  let q=[]; try{ q=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]'); }catch(e){ return; }
  if(!q.length) return;
  const total=q.length; let done=0;
  const rest=[];
  for(const item of q){
    try{
      if(item.type==='workout') await apiReq('/api/workouts',{method:'POST',body:item.payload});
      else if(item.type==='meal') await apiReq('/api/nutrition/log',{method:'POST',body:item.payload});
      else if(item.type==='challenge') await apiReq('/api/challenges/'+item.payload.id+'/progress',{method:'POST'});
      else if(item.type==='profile') await apiReq('/api/users/me/profile',{method:'PUT',body:item.payload});
      else continue;
      done++;
    }catch(e){ rest.push(item); break; } // stop at first failure, keep order
  }
  try{ localStorage.setItem(OUTBOX_KEY,JSON.stringify(rest)); }catch(e){}
  if(done>0) toast('<b>Back online</b><br>Synced '+done+' of '+total+' pending update(s).');
}
window.addEventListener('online', ()=>{ toast('<b>Back online</b><br>Syncing…'); flushOutbox(); });
window.addEventListener('offline', ()=>{ toast('<b>You are offline</b><br>Workout continues locally — will sync when back.'); });

/* ================= 7-DAY LOCAL STORAGE SYSTEM (per-user) ================= */
const STORAGE_KEY = 'fitquest_app_state';
const USERS_KEY = 'fitquest_users';
const STORAGE_METADATA_KEY = 'fitquest_metadata';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function userStorageKey(email){
  return STORAGE_KEY + '_' + String(email||'anon').toLowerCase();
}
function userMetaKey(email){
  return STORAGE_METADATA_KEY + '_' + String(email||'anon').toLowerCase();
}
function persistUsersRegistry(){
  try{ localStorage.setItem(USERS_KEY, JSON.stringify(state.users||[])); }catch(e){ console.error('Users save error:', e); }
}
function loadUsersRegistry(){
  try{
    const raw = localStorage.getItem(USERS_KEY);
    if(raw){ const u = JSON.parse(raw); if(Array.isArray(u)) return u; }
    // migration: pull registry out of legacy single-key blob
    const legacy = localStorage.getItem(STORAGE_KEY);
    if(legacy){ const ls = JSON.parse(legacy); if(ls && Array.isArray(ls.users)) return ls.users; }
  }catch(e){ console.error('Users load error:', e); }
  return [];
}
function syncUserRecord(){
  if(!state.currentUser?.email) return;
  const u = state.users.find(x=>x.email===state.currentUser.email);
  if(u){
    u.xp = state.xp; u.workoutsCompleted = state.workoutsCompleted;
    u.profile = state.profile; u.totalReps = state.totalReps; u.totalCalories = state.totalCalories;
  }
}

function pruneOldData(){
  // Remove history entries older than 7 days
  const now = Date.now();
  const sevenDaysAgo = now - SEVEN_DAYS_MS;
  if(state.history && state.history.length > 0){
    state.history = state.history.filter(entry => {
      const entryDate = new Date(entry.date).getTime();
      return entryDate >= sevenDaysAgo || isNaN(entryDate);
    });
  }
  // Reset challenges older than 7 days
  if(state.challenges){
    state.challenges.forEach(c => {
      if(c.createdAt){
        const challengeDate = new Date(c.createdAt).getTime();
        if(challengeDate < sevenDaysAgo){
          c.progress = 0; // Reset progress for old challenges
        }
      }
    });
  }
}

function saveStateToStorage(){
  try{
    pruneOldData();
    syncUserRecord();
    persistUsersRegistry();
    const email = state.currentUser?.email;
    if(!email) return;
    const metadata = {
      savedAt: new Date().toISOString(),
      userEmail: email,
      appVersion: '1.1-per-user-storage'
    };
    // per-user data blob (exclude registry + transient coach stream)
    const {users, ...rest} = state;
    const slim = {...rest, coach:{...rest.coach, running:false, stream:null, camera:null, pose:null}};
    localStorage.setItem(userMetaKey(email), JSON.stringify(metadata));
    localStorage.setItem(userStorageKey(email), JSON.stringify(slim));
  }catch(e){
    if(e.name === 'QuotaExceededError'){
      toast('<b>Storage full</b><br>Clear old data to continue.');
    }else{
      console.error('Save error:', e);
    }
  }
}

function loadStateFromStorage(){
  try{
    // Always load the shared user registry first
    const registry = loadUsersRegistry();
    if(registry.length) state.users = registry;
    const email = state.currentUser?.email;
    if(!email) return false;
    const saved = localStorage.getItem(userStorageKey(email));
    if(saved){
      const loaded = JSON.parse(saved);
      const keepUser = state.currentUser, keepUsers = state.users;
      Object.assign(state, loaded);
      state.currentUser = keepUser;
      state.users = keepUsers;
      if(!state.coach) state.coach = {selectedExercise:null,running:false,reps:0,sets:1,setTarget:3,seconds:0,phase:'up',formScore:100,feedback:'Get into position',confidence:'—',lastAngle:0,holdSeconds:0,altState:{left:'up',right:'up'},camera:null,pose:null,stream:null};
      if(!state.settings) state.settings = {voiceEnabled:true, remindersEnabled:false};
      state.coach.running = false;
      state.coach.stream = null;
      pruneOldData();
      return true;
    }
  }catch(e){
    console.error('Load error:', e);
    toast('<b>Storage corrupted</b><br>Starting fresh.');
  }
  return false;
}

function clearAllStorage(){
  if(confirm('Clear all saved data? This cannot be undone.')){
    try{
      // remove this user's blob + metadata, keep other users intact by default?
      // Requirement says "all" — so wipe every fitquest_* key.
      Object.keys(localStorage).filter(k=>k.indexOf('fitquest_')===0).forEach(k=>localStorage.removeItem(k));
    }catch(e){ console.error(e); }
    toast('<b>All data cleared</b><br>Refreshing...');
    setTimeout(() => location.reload(), 1000);
  }
}

function getStorageInfo(){
  try{
    const email = state.currentUser?.email;
    const saved = email ? localStorage.getItem(userStorageKey(email)) : null;
    const metadata = email ? localStorage.getItem(userMetaKey(email)) : null;
    if(!saved) return {status: 'empty', size: 0};
    const sizeBytes = new Blob([saved]).size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
    const meta = metadata ? JSON.parse(metadata) : {};
    return {
      status: 'saved',
      size: sizeMB,
      savedAt: meta.savedAt,
      userEmail: meta.userEmail,
      historyDays: state.history?.length || 0,
      challenges: state.challenges?.length || 0
    };
  }catch(e){
    return {status: 'error', error: e.message};
  }
}

function exportStateAsJSON(){
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitquest_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('<b>Backup exported</b><br>Check your downloads.');
}

function importStateFromJSON(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try{
        const imported = JSON.parse(event.target.result);
        const keepUser = state.currentUser;
        Object.assign(state, imported);
        // never trust imported identity / registry blindly
        if(keepUser) state.currentUser = keepUser;
        state.coach.running = false;
        state.coach.stream = null;
        if(imported.users && Array.isArray(imported.users)) persistUsersRegistry();
        saveStateToStorage();
        toast('<b>Backup restored</b><br>Refreshing...');
        setTimeout(() => location.reload(), 1000);
      }catch(e){
        toast('<b>Invalid file</b><br>Could not parse backup.');
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

/* ---------------- Exercise catalog ---------------- */
const EXERCISES = [
  {id:'squat',name:'Squat',icon:'🏋️',difficulty:'Beginner',category:['Lower Body','Strength'],muscles:['Quads','Glutes','Hamstrings'],desc:'A foundational lower-body movement that builds leg strength and stability.',reps:15,kcalPerRep:0.32,engine:'angle',joint:'knee',downAngle:100,upAngle:160,formNote:'Keep your knees tracking over your toes and chest upright.'},
  {id:'pushup',name:'Push-up',icon:'💪',difficulty:'Intermediate',category:['Upper Body','Strength'],muscles:['Chest','Triceps','Shoulders'],desc:'Classic bodyweight press for upper-body pushing strength.',reps:10,kcalPerRep:0.4,engine:'angle',joint:'elbow',downAngle:110,upAngle:145,formNote:'Keep hips in line with shoulders — avoid sagging.'},
  {id:'jumping_jack',name:'Jumping Jack',icon:'⭐',difficulty:'Beginner',category:['Cardio','Full Body'],muscles:['Full Body'],desc:'A full-body cardio movement that raises heart rate quickly.',reps:20,kcalPerRep:0.18,engine:'jack',formNote:'Fully extend arms overhead and legs wide at the top.'},
  {id:'lunge',name:'Lunge',icon:'🦵',difficulty:'Intermediate',category:['Lower Body','Strength'],muscles:['Quads','Glutes'],desc:'Single-leg movement that improves balance and leg strength.',reps:10,kcalPerRep:0.35,engine:'angle',joint:'knee',downAngle:100,upAngle:165,formNote:'Front knee should stay above the ankle, torso upright.'},
  {id:'plank',name:'Plank',icon:'🧘',difficulty:'Beginner',category:['Core','Full Body'],muscles:['Core','Shoulders'],desc:'An isometric hold that builds core endurance.',reps:30,kcalPerRep:0,engine:'hold',formNote:'Keep a straight line from shoulders to ankles — avoid hip sag.'},
  {id:'situp',name:'Sit-up',icon:'🔥',difficulty:'Beginner',category:['Core'],muscles:['Abs'],desc:'A core flexion exercise targeting the abdominal muscles.',reps:15,kcalPerRep:0.25,engine:'angle',joint:'hip',downAngle:150,upAngle:70,invert:true,formNote:'Curl through your spine — avoid pulling on your neck.'},
  {id:'high_knees',name:'High Knees',icon:'🏃',difficulty:'Beginner',category:['Cardio','Lower Body'],muscles:['Hip Flexors','Core'],desc:'Fast alternating knee drives for cardio conditioning.',reps:30,kcalPerRep:0.15,engine:'alternate',joint:'hip',formNote:'Drive knees up to at least hip height.'},
  {id:'bicep_curl',name:'Bicep Curl',icon:'💪',difficulty:'Beginner',category:['Upper Body','Strength'],muscles:['Biceps'],desc:'Isolated arm curl to build bicep strength.',reps:12,kcalPerRep:0.15,engine:'angle',joint:'elbow',downAngle:160,upAngle:50,invert:true,formNote:'Keep your upper arm still — curl from the elbow only.'},
  {id:'shoulder_press',name:'Shoulder Press',icon:'🙌',difficulty:'Intermediate',category:['Upper Body','Strength'],muscles:['Shoulders','Triceps'],desc:'Overhead press building shoulder strength and stability.',reps:10,kcalPerRep:0.22,engine:'shoulder_press',formNote:'Press directly overhead, avoid arching your lower back.'},
  {id:'glute_bridge',name:'Glute Bridge',icon:'🍑',difficulty:'Beginner',category:['Lower Body','Strength'],muscles:['Glutes','Hamstrings'],desc:'Hip extension movement that isolates the glutes.',reps:15,kcalPerRep:0.2,engine:'angle',joint:'hip',downAngle:150,upAngle:175,formNote:'Squeeze your glutes at the top, avoid arching the lower back.'},
  {id:'calf_raise',name:'Calf Raise',icon:'🦶',difficulty:'Beginner',category:['Lower Body'],muscles:['Calves'],desc:'A simple raise that strengthens the lower leg.',reps:20,kcalPerRep:0.1,engine:'angle',joint:'ankle',downAngle:90,upAngle:120,formNote:'Rise fully onto the balls of your feet, control the descent.'},
  {id:'mountain_climber',name:'Mountain Climber',icon:'⛰️',difficulty:'Advanced',category:['Cardio','Core','Full Body'],muscles:['Core','Shoulders','Hip Flexors'],desc:'A dynamic plank variation that drives knees toward the chest.',reps:30,kcalPerRep:0.16,engine:'alternate',joint:'hip',formNote:'Keep hips low and steady — avoid bouncing.'},
  {id:'yoga_tree',name:'Tree Pose',hi:'वृक्षासन',hing:'Vrikshasana',icon:'🌳',difficulty:'Beginner',category:['Yoga','Balance'],muscles:['Core','Ankles','Legs'],desc:'A standing balance pose that builds focus, stability and ankle strength.',reps:20,kcalPerRep:0,engine:'yoga_tree',formNote:'Keep your hips level and gaze steady on one point for balance.'},
  {id:'yoga_warrior2',name:'Warrior II',hi:'वीरभद्रासन २',hing:'Veerbhadrasana 2',icon:'🗡️',difficulty:'Intermediate',category:['Yoga','Strength'],muscles:['Legs','Core','Shoulders'],desc:'A powerful standing pose that builds leg strength and open-hip stability.',reps:20,kcalPerRep:0,engine:'yoga_warrior2',formNote:'Bend your front knee to 90°, extend arms to shoulder height, gaze over your front hand.'},
  {id:'yoga_chair',name:'Chair Pose',hi:'उत्कटासन',hing:'Utkatasana',icon:'🪑',difficulty:'Intermediate',category:['Yoga','Strength'],muscles:['Quads','Glutes','Shoulders'],desc:'A grounding pose that builds thigh and shoulder endurance.',reps:20,kcalPerRep:0,engine:'yoga_chair',formNote:'Sit your hips back and down as if sitting in a chair, reach your arms overhead.'},
  {id:'yoga_mountain',name:'Mountain Pose',hi:'ताड़ासन',hing:'Tadasana',icon:'🗻',difficulty:'Beginner',category:['Yoga','Balance'],muscles:['Legs','Core','Posture'],desc:'The base of all standing poses — teaches tall posture, steady legs and calm breathing.',reps:20,kcalPerRep:0,engine:'yoga_mountain',formNote:'Feet together, legs straight, arms relaxed by your sides, shoulders level.'},
  {id:'yoga_upward_salute',name:'Upward Salute',hi:'ऊर्ध्व हस्तासन',hing:'Urdhva Hastasana',icon:'🙆',difficulty:'Beginner',category:['Yoga','Balance'],muscles:['Shoulders','Core','Spine'],desc:'A tall stretch with both arms overhead that lengthens the spine and opens the shoulders.',reps:20,kcalPerRep:0,engine:'yoga_upward_salute',formNote:'Reach both arms straight overhead, keep your legs straight and ribs drawn in.'},
  {id:'yoga_warrior1',name:'Warrior I',hi:'वीरभद्रासन १',hing:'Veerbhadrasana 1',icon:'⚔️',difficulty:'Intermediate',category:['Yoga','Strength'],muscles:['Quads','Glutes','Shoulders'],desc:'A strong lunge with arms raised that builds leg strength and opens the hips and chest.',reps:20,kcalPerRep:0,engine:'yoga_warrior1',formNote:'Bend your front knee to about 90°, keep your back leg straight, raise both arms overhead.'},
  {id:'yoga_goddess',name:'Goddess Pose',hi:'उत्कट कोणासन',hing:'Utkat Konasana',icon:'🔱',difficulty:'Intermediate',category:['Yoga','Strength'],muscles:['Quads','Inner Thighs','Glutes'],desc:'A wide, low stance with bent-elbow arms that strengthens the legs and opens the hips.',reps:20,kcalPerRep:0,engine:'yoga_goddess',formNote:'Feet wide, knees bent over your toes, elbows bent with hands up like a cactus.'},
  {id:'yoga_triangle',name:'Triangle Pose',hi:'त्रिकोणासन',hing:'Trikonasana',icon:'🔺',difficulty:'Intermediate',category:['Yoga','Flexibility'],muscles:['Hamstrings','Obliques','Hips'],desc:'A wide-legged side stretch that lengthens the hamstrings, sides of the body and spine.',reps:20,kcalPerRep:0,engine:'yoga_triangle',formNote:'Legs wide and straight, tilt your torso sideways, one arm reaching down and one reaching up.'},
  {id:'yoga_side_bend',name:'Standing Side Bend',hi:'तिर्यक ताड़ासन',hing:'Tiryak Tadasana',icon:'🌴',difficulty:'Beginner',category:['Yoga','Flexibility'],muscles:['Obliques','Shoulders','Spine'],desc:'A gentle sway with arms overhead — also called the swaying palm tree — that stretches the sides of the body.',reps:20,kcalPerRep:0,engine:'yoga_side_bend',formNote:'Arms overhead, legs straight, lean smoothly to one side without twisting.'},
  {id:'yoga_prayer',name:'Prayer Pose',hi:'प्रणामासन',hing:'Pranamasana',icon:'🙏',difficulty:'Beginner',category:['Yoga','Balance'],muscles:['Core','Chest','Posture'],desc:'A calm standing pose with palms together at the chest that builds focus and steady breathing.',reps:20,kcalPerRep:0,engine:'yoga_prayer',formNote:'Palms pressed together at your heart, shoulders relaxed, stand tall.'},
];

/* ---------------- Food catalog ---------------- */
const FOODS = [
  {n:'Roti',u:'1 piece',kcal:120,p:3,c:18,f:3,ic:'🫓'},
  {n:'Steamed Rice',u:'1 cup',kcal:205,p:4,c:45,f:0.5,ic:'🍚'},
  {n:'Dal',u:'1 cup',kcal:230,p:18,c:40,f:1,ic:'🥣'},
  {n:'Paneer',u:'100 g',kcal:265,p:18,c:4,f:21,ic:'🧀'},
  {n:'Chicken Curry',u:'1 cup',kcal:300,p:27,c:10,f:18,ic:'🍛'},
  {n:'Boiled Egg',u:'1 piece',kcal:78,p:6,c:0.6,f:5,ic:'🥚'},
  {n:'Poha',u:'1 plate',kcal:250,p:4,c:45,f:7,ic:'🍚'},
  {n:'Idli',u:'2 pieces',kcal:140,p:4,c:30,f:0.5,ic:'⚪'},
  {n:'Dosa',u:'1 piece',kcal:168,p:4,c:29,f:4,ic:'🌯'},
  {n:'Samosa',u:'1 piece',kcal:260,p:4,c:24,f:17,ic:'🥟'},
  {n:'Upma',u:'1 plate',kcal:230,p:6,c:35,f:7,ic:'🍲'},
  {n:'Mixed Vegetables',u:'1 cup',kcal:120,p:3,c:15,f:5,ic:'🥗'},
  {n:'Banana',u:'1 medium',kcal:105,p:1,c:27,f:0.4,ic:'🍌'},
  {n:'Apple',u:'1 medium',kcal:95,p:0.5,c:25,f:0.3,ic:'🍎'},
  {n:'Curd',u:'1 cup',kcal:150,p:8,c:11,f:8,ic:'🥛'},
  {n:'Milk',u:'1 cup',kcal:150,p:8,c:12,f:8,ic:'🥛'},
  {n:'Chicken Biryani',u:'1 plate',kcal:550,p:25,c:70,f:18,ic:'🍛'},
  {n:'Grilled Chicken Breast',u:'100 g',kcal:165,p:31,c:0,f:3.6,ic:'🍗'},
  {n:'Green Salad',u:'1 bowl',kcal:80,p:3,c:10,f:3,ic:'🥗'},
  {n:'Oats',u:'1 bowl',kcal:150,p:5,c:27,f:3,ic:'🥣'},
  {n:'Paratha',u:'1 piece',kcal:260,p:6,c:30,f:13,ic:'🫓'},
  {n:'Rajma',u:'1 cup',kcal:220,p:13,c:38,f:1,ic:'🥘'},
  {n:'Chole',u:'1 cup',kcal:270,p:12,c:45,f:5,ic:'🥘'},
  {n:'Pizza Slice',u:'1 slice',kcal:285,p:12,c:36,f:10,ic:'🍕'},
  {n:'Burger',u:'1 piece',kcal:350,p:17,c:33,f:17,ic:'🍔'},
  {n:'Sandwich',u:'1 piece',kcal:250,p:10,c:30,f:9,ic:'🥪'},
  {n:'Protein Shake',u:'1 scoop',kcal:150,p:25,c:8,f:2,ic:'🥤'},
  {n:'Almonds',u:'10 pieces',kcal:70,p:2.5,c:2.5,f:6,ic:'🌰'},
  {n:'Peanut Butter',u:'1 tbsp',kcal:95,p:4,c:3,f:8,ic:'🥜'},
];

/* ---------------- Badges ---------------- */
const BADGE_DEFS = [
  {id:'first',icon:'🏆',name:'First Workout',desc:'Completed your very first workout.'},
  {id:'streak7',icon:'🔥',name:'7-Day Streak',desc:'Active 7 days in a row.'},
  {id:'rep100',icon:'💪',name:'100 Rep Warrior',desc:'Logged 100 total reps.'},
  {id:'speed',icon:'⚡',name:'Speed Champion',desc:'Finished a workout in record time.'},
  {id:'perfect',icon:'🎯',name:'Perfect Form',desc:'Scored 95+ form on a set.'},
  {id:'challenge',icon:'🏅',name:'Challenge Champion',desc:'Completed a challenge.'},
  {id:'master',icon:'👑',name:'Fitness Master',desc:'Reached Level 5.'},
];

const LEVELS = ['Beginner','Active','Fit','Athlete','Fitness Master'];
function levelForXp(xp){return clamp(Math.floor(xp/500),0,4);}
function xpIntoLevel(xp){return xp - levelForXp(xp)*500;}

const MOTIVATION = [
  "You're one workout away from becoming stronger.",
  "Small reps, big results. Keep going.",
  "Consistency beats intensity — show up today.",
  "Your future self is already proud of you.",
  "Every rep counts. Make this one count.",
];

/* ---------------- Challenges ---------------- */
function freshChallenges(){
  return [
    {id:'sq7',icon:'🦵',name:'7-Day Squat Challenge',desc:'Complete squat sets every day for a week.',target:7,progress:0,xp:150,participants:214,unit:'days'},
    {id:'fit30',icon:'📅',name:'30-Day Fitness Challenge',desc:'Complete at least one workout for 30 days.',target:30,progress:0,xp:600,participants:512,unit:'days'},
    {id:'pu100',icon:'💪',name:'100 Push-up Challenge',desc:'Accumulate 100 push-up reps.',target:100,progress:0,xp:200,participants:341,unit:'reps'},
    {id:'daily10',icon:'⏱️',name:'Daily 10-Minute Challenge',desc:'Complete a 10-minute session daily.',target:10,progress:0,xp:120,participants:178,unit:'sessions'},
    {id:'college',icon:'🎓',name:'College Fitness Challenge',desc:'Represent your college on the national leaderboard.',target:20,progress:0,xp:300,participants:96,unit:'workouts'},
  ];
}

/* ---------------- Global state ---------------- */
const state = {
  loggedIn:false,
  users:[], // {email,password,profile}
  currentUser:null,
  view:'dashboard',
  xp:0,
  streak:0,
  streakDays:['','','','','','',''], // legacy Mon..Sun flags (kept for compat)
  loginDates:{}, // YYYY-MM-DD -> true, every day the user opened the app
  firstSeen:null, // first-ever login date; days before it render neutral
  badges:{},
  workoutsCompleted:0,
  totalReps:0,
  totalCalories:0,
  formScores:[],
  history:[], // {date, workouts, reps, xp, calories, formScore}
  challenges:freshChallenges(),
  nutrition:{calGoal:2200,pGoal:100,cGoal:250,fGoal:70,log:[]}, // log: {meal,name,kcal,p,c,f,qty}
  coach:{selectedExercise:null,running:false,reps:0,sets:1,setTarget:3,seconds:0,phase:'up',formScore:100,feedback:'Get into position',confidence:'—',lastAngle:0,holdSeconds:0,altState:{left:'up',right:'up'},camera:null,pose:null,stream:null},
  premium:false, premiumPlan:null, todaysSuggestionCache:null,
  trainerPlan:null, weightLog:[], // weightLog: {date, weight}
  assistantChat:[], // {role:'user'|'ai', text, at}
  suggestions:[], // {text, at}
  readiness:{dateKey:null, sleep:null, energy:null, soreness:null, score:null}, // today's morning check-in
  steps:{dateKey:'', count:0, xpMilestone:0},
  lastSpinDate:null,
  lastShareDate:null,
  xpSpent:0, redeemedItems:[], // {id,name,icon,costXp,redeemedAt}
  settings:{voiceEnabled:true, remindersEnabled:false}, // spoken coaching (Premium) + missed-day nudges
};

function addXp(amount,reason){
  const beforeLevel = levelForXp(state.xp);
  state.xp += amount;
  const afterLevel = levelForXp(state.xp);
  toast(`<b>+${amount} XP</b><br>${reason}`);
  if(afterLevel>beforeLevel){
    toast(`<b>🎉 Level Up!</b><br>You reached Level ${afterLevel+1} — ${LEVELS[afterLevel]}`);
    if(afterLevel>=4) unlockBadge('master');
  }
  // Keep user registry in sync so the leaderboard shows real data
  syncUserRecord();
  persistUsersRegistry();
  refreshChrome();
  saveStateToStorage();
}
function unlockBadge(id){
  if(state.badges[id]) return;
  state.badges[id]=true;
  const b=BADGE_DEFS.find(x=>x.id===id);
  if(b) toast(`<b>🏅 Badge Unlocked</b><br>${b.name}`);
  saveStateToStorage();
}
function todayIdx(){ const d=new Date().getDay(); return d===0?6:d-1; }
/* Local calendar date (YYYY-MM-DD). Must NOT use toISOString (UTC) here:
   in IST, local midnight is still "yesterday" in UTC, which shifted every
   week cell a day back and wrongly ticked future days. */
function dayStr(d){ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function mondayOfWeek(ref){
  const d=new Date(ref); const off=(d.getDay()+6)%7;
  d.setDate(d.getDate()-off); d.setHours(0,0,0,0); return d;
}
/* Record today's login, then recompute the streak as consecutive login days.
   Called on every app entry — a missed day breaks the chain, which is what
   makes the ✗ cells meaningful. */
function recordLoginDay(){
  if(!state.loginDates) state.loginDates={};
  // One-time reset: keys stored before the UTC→local fix are off by a day.
  // The feature is days old, so restart clean rather than show wrong ticks.
  if(!state.streakTzFix){ state.loginDates={}; state.firstSeen=null; state.streakTzFix=1; }
  const today = dayStr(new Date());
  state.loginDates[today]=true;
  if(!state.firstSeen) state.firstSeen=today;
  state.streak = calcLoginStreak();
  saveStateToStorage();
}
function calcLoginStreak(){
  const dates = state.loginDates||{};
  let s=0; const d=new Date();
  while(dates[dayStr(d)]){ s++; d.setDate(d.getDate()-1); }
  return s;
}
/* Mon..Sun cells for the current week:
   ✓ logged in · ✗ missed (since first login) · ○ upcoming / pre-account */
function weekStreakCells(){
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const mon=mondayOfWeek(new Date());
  const todayS=dayStr(new Date());
  const tIdx=todayIdx();
  const logins=state.loginDates||{};
  return days.map((d,i)=>{
    const dt=new Date(mon); dt.setDate(mon.getDate()+i);
    const ds=dayStr(dt);
    let cls='', icon='○';
    if(ds>todayS){ cls=''; icon='○'; }
    else if(logins[ds]){ cls='done'; icon='✓'; }
    else if(state.firstSeen && ds>=state.firstSeen){ cls='missed'; icon='✗'; }
    return `<div class="streak-day ${cls} ${i===tIdx?'today':''}"><i>${icon}</i>${d}</div>`;
  }).join('');
}

/* ================= AUTH VIEWS ================= */
function renderAuthLogin(){
  el('auth-card-holder').innerHTML = `
    <div class="auth-card">
      <h2 class="display">Welcome back</h2>
      <div class="sub">Log in to continue your quest.</div>
      <div class="field"><label>Email</label><input id="li-email" type="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input id="li-pass" type="password" placeholder="••••••••"></div>
      <div class="remember"><input type="checkbox" id="li-remember" checked> Remember me</div>
      <button class="btn btn-volt btn-block" onclick="doLogin(this)">Log In</button>
      ${GOOGLE_BTN_HTML}
      <div class="auth-links">
        <button onclick="renderAuthForgot()">Forgot password?</button>
        <button onclick="renderAuthSignup()">Create account</button>
      </div>
    </div>`;
}
function renderAuthSignup(){
  el('auth-card-holder').innerHTML = `
    <div class="auth-card">
      <button class="auth-back-btn" onclick="renderAuthLogin()">← Back to Login</button>
      <h2 class="display">Create account</h2>
      <div class="sub">Start your FitQuest in under a minute.</div>
      <div class="field"><label>Full Name</label><input id="su-name" placeholder="Jordan Rao"></div>
      <div class="field"><label>Email</label><input id="su-email" type="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input id="su-pass" type="password" placeholder="At least 6 characters"></div>
      <button class="btn btn-volt btn-block" onclick="doSignup(this)">Sign Up</button>
      ${GOOGLE_BTN_HTML}
    </div>`;
}
function renderAuthForgot(){
  el('auth-card-holder').innerHTML = `
    <div class="auth-card">
      <button class="auth-back-btn" onclick="renderAuthLogin()">← Back to Login</button>
      <h2 class="display">Reset password</h2>
      <div class="sub">We'll send a reset link to your email (prototype simulation).</div>
      <div class="field"><label>Email</label><input id="fp-email" type="email" placeholder="you@example.com"></div>
      <button class="btn btn-volt btn-block" onclick="doForgot()">Send Reset Link</button>
    </div>`;
}
async function doSignup(btn){
  const name=el('su-name').value.trim(), email=el('su-email').value.trim().toLowerCase(), pass=el('su-pass').value;
  if(!name||!email||pass.length<6){toast('<b>Missing info</b><br>Fill all fields, password 6+ chars.');return;}
  setBtnLoading(btn, true);
  // Try backend first (real email verification); fall back to local-only mode if API is down
  try{
    const out = await apiSignupRemote(name,email,pass);
    state.currentUser={name,email};
    renderVerifyScreen(email, null);
    if(out && out.dev_code) showDevCode(out.dev_code);
    toast('<b>Account created</b><br>Enter the code we emailed you.');
    return;
  }catch(e){
    const msg = String((e&&e.message)||e);
    if(msg.indexOf('429')===0){ toast('<b>Too many attempts</b><br>Wait a few seconds and try again.'); setBtnLoading(btn,false); return; }
    if(msg.indexOf('409')===0){ toast('<b>Email taken</b><br>Try logging in instead.'); setBtnLoading(btn,false); return; }
    if(msg.indexOf('502')===0){ toast('<b>Email service error</b><br>'+esc(prettyAuthError(msg))+'. Try again shortly.'); setBtnLoading(btn,false); return; }
    if(/^\d{3}/.test(msg)){ toast('<b>Signup failed</b><br>'+esc(prettyAuthError(msg))+'. Fix this and try again.'); setBtnLoading(btn,false); return; }
    /* Network error / timeout: the server may still have created the account
       and emailed the code despite the dropped response — retry once, which
       lands on the "exists but unverified" path with a fresh code. */
    try{
      const out2 = await apiSignupRemote(name,email,pass);
      state.currentUser={name,email};
      renderVerifyScreen(email, null);
      if(out2 && out2.dev_code) showDevCode(out2.dev_code);
      toast('<b>Account created</b><br>Enter the code we emailed you.');
      return;
    }catch(e2){ /* still offline -> local fallback below */ }
    /* offline or other network error -> local fallback below */
  }
  state.users = loadUsersRegistry().concat(state.users.filter(u=>u.email && loadUsersRegistry().every(r=>r.email!==u.email)));
  if(state.users.some(x=>x.email===email)){ toast('<b>Email taken</b><br>Try logging in instead.'); return; }
  // "not stored in plain text" -- simulate hashing (prototype only, not secure)
  const hashed = btoa(pass).split('').reverse().join('');
  state.users.push({name,email,hashed,xp:0,workoutsCompleted:0});
  persistUsersRegistry();
  state.currentUser={name,email};
  toast('<b>Account created</b><br>Let\'s set up your profile.');
  renderOnboarding();
}
async function hydrateFromServer(){
  const me = await apiFetchMe();
  if(!me) return false;
  state.xp = me.xp||0; state.workoutsCompleted = me.workouts_completed||0;
  state.totalReps = me.total_reps||0; state.totalCalories = me.total_calories||0;
  state.streak = me.streak||0;
  if(me.streak_days && me.streak_days.length) state.streakDays = me.streak_days;
  state.badges = me.badges||{};
  if(me.profile) state.profile = me.profile;
  try{
    const hist = await apiReq('/api/workouts/history?days=90');
    if(Array.isArray(hist)) state.history = hist.map(h=>({date:h.date,workouts:h.workouts,reps:h.reps,xp:h.xp,calories:h.calories,formScore:h.formScore}));
  }catch(e){}
  return true;
}
async function doLogin(btn){
  const email=el('li-email').value.trim().toLowerCase(), pass=el('li-pass').value;
  setBtnLoading(btn, true);
  // Backend attempt first
  try{
    await apiLoginRemote(email,pass);
    state.currentUser={name:email.split('@')[0],email};
    const ok = await hydrateFromServer();
    if(ok){ const meNow=await apiFetchMe(); state.currentUser={name:(meNow&&meNow.name)||state.currentUser.name,email}; requireProfileOrEnter(meNow||{}); return; }
  }catch(e){
    const msg = String((e&&e.message)||e);
    if(msg.indexOf('429')===0){ toast('<b>Too many attempts</b><br>Wait a few seconds and try again.'); setBtnLoading(btn,false); return; }
    if(msg.indexOf('403')===0){ renderVerifyScreen(email, 'This email is not verified yet — enter your code below.'); return; }
    /* fall through to local */
  }
  state.users = loadUsersRegistry().length ? loadUsersRegistry() : state.users;
  const hashed = btoa(pass).split('').reverse().join('');
  const u = state.users.find(x=>x.email===email);
  if(!u || u.hashed!==hashed){toast('<b>Login failed</b><br>Check your email and password.');setBtnLoading(btn,false);return;}
  state.currentUser={name:u.name,email:u.email};
  requireProfileOrEnter(u);
}
function doForgot(){
  toast('<b>Reset link sent</b><br>(Simulated — no email service connected in this prototype.)');
  renderAuthLogin();
}

/* ================= RESET PASSWORD (logged-in: email code → verify → new password) ================= */
let forgotStep=1, forgotEmail='';
function renderForgotView(){
  el('view-forgot').innerHTML = `
    <div class="paywall-wrap" style="max-width:520px;">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="setView('dashboard')">←</button>
        <h1 class="display" style="font-size:24px;">🔑 Reset Password</h1>
      </div>
      <p class="paywall-sub">Get a code by email, verify it, then set a new password.</p>
      <div id="forgot-dev-note"></div>
      ${forgotStep===1 ? `
      <div class="card">
        <p class="small-muted" style="margin-bottom:12px;">We'll send a 6-digit verification code to your account email:</p>
        <div class="fake-order-row total" style="border:none;margin:0 0 14px;padding:0;"><span>${esc(state.currentUser?state.currentUser.email:'')}</span></div>
        <button class="btn btn-volt btn-block" id="fp-send-btn" onclick="forgotSendCode()">Send Code</button>
      </div>` : `
      <div class="card">
        <p class="small-muted" style="margin-bottom:12px;">Code sent to <b>${esc(forgotEmail)}</b>. It expires in 20 minutes.</p>
        <div class="field"><label>6-digit code</label><input id="fp-code" inputmode="numeric" maxlength="6" placeholder="••••••"></div>
        <div class="row2">
          <div class="field"><label>New password</label><input id="fp-pass" type="password" placeholder="Min 6 characters"></div>
          <div class="field"><label>Confirm password</label><input id="fp-pass2" type="password" placeholder="Repeat it"></div>
        </div>
        <button class="btn btn-volt btn-block" id="fp-reset-btn" onclick="forgotReset()">Reset Password</button>
      </div>`}
    </div>`;
}
async function forgotSendCode(){
  const email = state.currentUser ? state.currentUser.email : '';
  if(!email){ toast('<b>Not logged in</b>'); setView('dashboard'); return; }
  const btn=el('fp-send-btn'); setBtnLoading(btn, true);
  try{
    const out=await apiReq('/api/auth/forgot',{method:'POST',body:{email}});
    forgotEmail=(out&&out.email)||email; forgotStep=2; renderForgotView();
    toast(`<b>Code sent</b><br>${esc((out&&out.message)||'Check your email.')}`);
    if(out&&out.dev_code){
      const h=el('forgot-dev-note');
      if(h) h.innerHTML=`<div class="err-box" style="margin-bottom:12px;border-color:var(--blue);">Email delivery unavailable here — your code is <b>${esc(out.dev_code)}</b></div>`;
    }
  }catch(e){
    toast('<b>Could not send code</b><br>'+esc(prettyAuthError(e.message)));
    setBtnLoading(btn, false);
  }
}
async function forgotReset(){
  const code=(el('fp-code').value||'').trim();
  const p1=el('fp-pass').value||'', p2=el('fp-pass2').value||'';
  if(code.length<4){ toast('<b>Enter the code</b>'); return; }
  if(p1.length<6){ toast('<b>Password too short</b><br>Minimum 6 characters.'); return; }
  if(p1!==p2){ toast('<b>Passwords do not match</b>'); return; }
  const btn=el('fp-reset-btn'); setBtnLoading(btn, true);
  try{
    await apiReq('/api/auth/reset',{method:'POST',body:{email:forgotEmail,code:code,new_password:p1}});
    forgotStep=1;
    toast('<b>✅ Password reset</b><br>Use your new password next time you log in.');
    setView('dashboard');
  }catch(e){
    toast('<b>Reset failed</b><br>'+esc(prettyAuthError(e.message)));
    setBtnLoading(btn, false);
  }
}
/* ================= ONBOARDING ================= */
let onbStep=0;
const onbData={};
/* Profile completeness gate: NO app access without real details.
   City is optional and 'Prefer not to say' is an allowed gender answer —
   both pass. Legacy '—' placeholders on required fields still count as missing. */
const PROFILE_REQUIRED = ['age','gender','height','weight','goal','level','activity'];
function profileComplete(p){
  if(!p) return false;
  return PROFILE_REQUIRED.every(k=>{
    const v = p[k];
    if(v===null || v===undefined) return false;
    if(typeof v==='number') return v>0;
    const s = String(v).trim();
    return s!=='' && s!=='—';
  });
}
/* Bounce incomplete users straight to the details form — no toast in between.
   Forces the auth screen visible so the form can't hide behind app chrome. */
function sendToOnboarding(){
  onbStep=0; for(const k of Object.keys(onbData)) delete onbData[k];
  state.profile=null;
  try{
    el('auth-screen').classList.remove('hidden');
    el('app').classList.add('hidden');
    el('app-topbar').classList.remove('visible');
    window.scrollTo(0,0);
  }catch(e){}
  renderOnboarding();
}
/* Single checkpoint used by every login path (email, verify, Google, boot). */
function requireProfileOrEnter(me){
  const p = me && me.profile;
  if(profileComplete(p)){ state.profile=p; enterApp(); return true; }
  sendToOnboarding();
  return false;
}
function renderOnboarding(){
  el('auth-card-holder').innerHTML = onbTemplate();
  bindOnbStep();
}
function onbTemplate(){
  return `<div class="auth-card">
    <div class="onb-progress">${[0,1,2].map(i=>`<i class="${i<=onbStep?'done':''}"></i>`).join('')}</div>
    <div id="onb-body"></div>
  </div>`;
}
function bindOnbStep(){
  const body = el('onb-body');
  if(onbStep===0){
    body.innerHTML = `
      <h2 class="display">Tell us about you</h2>
      <div class="sub">Step 1 of 3 — basics</div>
      <div class="row2">
        <div class="field"><label>Age</label><input id="ob-age" type="number" placeholder="24"></div>
        <div class="field"><label>Gender</label>
          <select id="ob-gender"><option value="" selected disabled>Select</option><option>Male</option><option>Female</option><option>Prefer not to say</option></select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>Height (cm)</label><input id="ob-height" type="number" placeholder="175"></div>
        <div class="field"><label>Weight (kg)</label><input id="ob-weight" type="number" placeholder="70"></div>
      </div>
        <div class="field"><label>City (optional)</label><input id="ob-city" placeholder="Mumbai"></div>
      <button class="btn btn-volt btn-block" onclick="onbNext(0)">Continue</button>`;
  } else if(onbStep===1){
    const goals=['Improve Fitness','Build Strength','Lose Weight','Improve Stamina','Stay Active'];
    body.innerHTML = `
      <h2 class="display">Your goal</h2>
      <div class="sub">Step 2 of 3 — what are you working toward?</div>
      <div class="chip-grid" id="goal-chips">
        ${goals.map(g=>`<button class="chip" data-g="${g}" onclick="selectChip(this,'goal')">${g}</button>`).join('')}
      </div>
      <button class="btn btn-volt btn-block mt" onclick="onbNext(1)">Continue</button>`;
  } else {
    const levels=['Beginner','Intermediate','Advanced'];
    const acts=['Low','Moderate','High'];
    body.innerHTML = `
      <h2 class="display">Fitness level</h2>
      <div class="sub">Step 3 of 3 — helps us tailor your plan</div>
      <div class="chip-grid" id="level-chips">
        ${levels.map(l=>`<button class="chip" data-g="${l}" onclick="selectChip(this,'level')">${l}<div class="d">Fitness level</div></button>`).join('')}
      </div>
      <div class="field mt"><label>Daily Activity Level</label>
        <select id="ob-activity">${acts.map(a=>`<option>${a}</option>`).join('')}</select>
      </div>
      <button class="btn btn-volt btn-block mt" onclick="finishOnboarding()">Create My Dashboard</button>`;
  }
}
function selectChip(btn,key){
  const parent=btn.parentElement;
  [...parent.children].forEach(c=>c.classList.remove('sel'));
  btn.classList.add('sel');
  onbData[key]=btn.dataset.g;
}
function onbNext(step){
  if(step===0){
    // Every field mandatory — no silent defaults. Invalid input blocks Continue.
    const age=parseInt(el('ob-age').value,10), height=parseFloat(el('ob-height').value), weight=parseFloat(el('ob-weight').value);
    const gender=el('ob-gender').value, city=el('ob-city').value.trim();
    if(!(age>=5&&age<=100)){toast('<b>Age required</b><br>Enter an age between 5 and 100.');return;}
    if(!gender){toast('<b>Gender required</b><br>Select an option to continue.');return;}
    if(!(height>=100&&height<=250)){toast('<b>Height required</b><br>Enter height in cm (100–250).');return;}
    if(!(weight>=25&&weight<=300)){toast('<b>Weight required</b><br>Enter weight in kg (25–300).');return;}
    if(city && city.length<2){toast('<b>City too short</b><br>Enter your city or leave it blank.');return;}
    onbData.age=age; onbData.gender=gender; onbData.height=height; onbData.weight=weight; onbData.city=city||'—';
  }
  if(step===1 && !onbData.goal){toast('<b>Pick a goal</b><br>Select one to continue.');return;}
  onbStep++;
  el('auth-card-holder').innerHTML = onbTemplate();
  bindOnbStep();
}
function finishOnboarding(){
  if(!onbData.level){toast('<b>Pick a level</b><br>Select one to continue.');return;}
  onbData.activity = el('ob-activity').value;
  state.profile = {...onbData};
  const u = state.users.find(x=>x.email===state.currentUser.email);
  if(u) u.profile = state.profile;
  persistUsersRegistry();
  apiSyncProfile();
  toast(`<b>Profile created</b><br>Welcome, ${state.currentUser.name}!`);
  enterApp();
}

/* ================= APP ENTRY / NAV ================= */
// All sidebar items (Progress is accessible via Profile, but kept here for routing)
const NAV_ITEMS = [
  {id:'dashboard',label:'Dashboard',ic:'🏠'},
  {id:'coach',label:'AI Coach',ic:'🎥'},
  {id:'yoga',label:'Yoga AI',ic:'🧘'},
  {id:'library',label:'Exercises',ic:'📚'},
  {id:'nutrition',label:'Nutrition AI',ic:'🍎'},
  {id:'challenges',label:'Challenges',ic:'🎯'},
  {id:'leaderboard',label:'Leaderboard',ic:'🏆'},
  {id:'xpstore',label:'XP Store',ic:'🪙'},
  {id:'profile',label:'Profile',ic:'👤'},
];
// 4 items shown in bottom nav on mobile
const BOTTOM_NAV_ITEMS = [
  {id:'dashboard',label:'Dashboard',ic:'🏠'},
  {id:'coach',label:'AI Coach',ic:'🎥'},
  {id:'nutrition',label:'Nutrition',ic:'🍎'},
  {id:'profile',label:'Profile',ic:'👤'},
];

function openDrawer(){
  el('drawer').classList.add('open');
  el('drawer-overlay').classList.add('open');
}
function closeDrawer(){
  el('drawer').classList.remove('open');
  el('drawer-overlay').classList.remove('open');
}

function enterApp(){
  el('auth-screen').classList.add('hidden');
  el('app').classList.remove('hidden');
  el('app-topbar').classList.add('visible');
  // Load saved state — currentUser is already set before this call
  const wasRestored = loadStateFromStorage();
  // Restore this user's display preference (profile theme wins over global)
  try{
    const pt = state.profile && state.profile.theme;
    const lt = localStorage.getItem('fitquest_theme');
    applyTheme(pt || lt || 'dark');
    if(pt) localStorage.setItem('fitquest_theme', pt);
  }catch(e){}
  try{ syncThemePillBtn(); }catch(e){}
  recordLoginDay(); // tick today, recompute streak from login history
  try{ autoStartStepTracking(); }catch(e){}
  setTimeout(()=>{ try{ checkMissedDayReminder(); }catch(e){} }, 1200);
  // Drop dead backend sessions (e.g. server DB was reset since last visit).
  // Only clear on a definite 401 — never on network errors, so offline keeps working.
  if(apiToken()){
    apiReq('/api/auth/me').catch(e=>{
      if(String((e && e.message) || e).indexOf('401')===0) apiSetToken(null);
    });
    flushOutbox(); // push anything queued while offline
  }
  // Remember who is inside, so a reload (e.g. OS killing the tab during
  // camera) restores the session instead of dumping at the login screen.
  try{ if(state.currentUser) localStorage.setItem('fitquest_session',state.currentUser.email); }catch(e){}
  // Returning from the native food camera after an OS-kill reload? Session +
  // view restore below; add a guiding toast (fresh flag only, 10-min window).
  try{
    const ret = sessionStorage.getItem('fitquest_food_return');
    if(ret){
      sessionStorage.removeItem('fitquest_food_return');
      if(Date.now()-(parseInt(ret,10)||0) < 10*60*1000){
        setTimeout(()=>toast('<b>📷 Welcome back</b><br>Tap Take Photo to snap your meal again — everything else is intact.'), 900);
      }
    }
  }catch(e){}
  viewHistory=[];
  // Sidebar nav (PC)
  el('nav-list').innerHTML = NAV_ITEMS.map(n=>`<button class="nav-item" data-v="${n.id}" onclick="setView('${n.id}')"><span class="ic">${n.ic}</span>${n.label}</button>`).join('');
  // Drawer nav (hamburger, works on both PC + mobile)
  el('drawer-nav-list').innerHTML = NAV_ITEMS.map(n=>`<button class="nav-item" data-v="${n.id}" onclick="setView('${n.id}');closeDrawer();"><span class="ic">${n.ic}</span>${n.label}</button>`).join('');
  // Bottom nav — 4 items, mobile only
  el('bottom-nav').innerHTML = BOTTOM_NAV_ITEMS.map(n=>`<button data-v="${n.id}" onclick="setView('${n.id}')"><span class="bn-icon">${n.ic}</span><span>${n.label}</span></button>`).join('');
  refreshChrome();
  // Resume the page they were on (restored from storage after a reload).
  const resumeTo = (state.view && el('view-'+state.view)) ? state.view : 'dashboard';
  try{ history.replaceState({view:resumeTo},'','#'+resumeTo); }catch(e){}
  setView(resumeTo,true);
}
function initials(name){return (name||'A').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function refreshChrome(){
  el('side-avatar').textContent = initials(state.currentUser.name);
  el('side-name').textContent = state.currentUser.name;
  el('side-level').textContent = 'Level '+(levelForXp(state.xp)+1)+' · '+LEVELS[levelForXp(state.xp)];
  // Topbar avatar (first option, upper-left)
  if(el('topbar-avatar')) el('topbar-avatar').textContent = initials(state.currentUser.name);
  // Also update drawer footer
  if(el('drawer-avatar')){
    el('drawer-avatar').textContent = initials(state.currentUser.name);
    el('drawer-name').textContent = state.currentUser.name;
    el('drawer-level').textContent = 'Level '+(levelForXp(state.xp)+1)+' · '+LEVELS[levelForXp(state.xp)];
  }
}
/* In-app page history — every setView is a page, so the phone back button
   (and the ← topbar button) walk back through pages instead of exiting. */
let viewHistory=[];
function updateBackBtn(){
  const b=el('back-btn');
  // Visible on every page except Dashboard — even with an empty trail
  // (e.g. after a refresh deep-linked into AI Coach).
  if(b) b.classList.toggle('hidden', !state.view || state.view==='dashboard');
}
function goBack(){
  if(viewHistory.length){ try{ history.back(); return; }catch(e){} }
  const prev=viewHistory.pop();
  if(prev) setView(prev,true);
  else setView('dashboard',true); // no trail (e.g. after refresh) — home is the only sane target
}
window.addEventListener('popstate', (e)=>{
  const fromStack = viewHistory.pop();
  // Prefer the browser's own entry (survives reloads); fall back to our trail.
  const v = (e.state && e.state.view && el('view-'+e.state.view)) ? e.state.view : fromStack;
  if(v && v!==state.view) setView(v,true);
  else updateBackBtn(); // at root — let the browser leave
});
function setView(v,isPop){
  if((v==='assistant'||v==='trainer') && !state.premium){
    toast('<b>Premium required</b><br>Unlock Premium to access this feature.');
    v='paywall';
  }
  if(!isPop && state.view && state.view!==v){
    if(v==='dashboard') viewHistory=[]; // home resets the trail — never shows ←
    else{
      viewHistory.push(state.view);
      if(viewHistory.length>40) viewHistory.shift();
    }
    try{ history.pushState({view:v},'','#'+v); }catch(e){}
  }
  state.view=v;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  if(el('view-'+v)) el('view-'+v).classList.add('active');
  // First visit per session plays entrance animations; repeats render instantly.
  try{
    window._seenViews = window._seenViews || {};
    const mc = el('main-content');
    if(mc) mc.classList.toggle('instant', !!window._seenViews[v]);
    window._seenViews[v] = 1;
  }catch(e){}
  // New page starts at top — never inherit the previous view's scroll position.
  try{ const mc=el('main-content'); if(mc) mc.scrollTop=0; window.scrollTo(0,0); }catch(e){}
  document.querySelectorAll('.nav-item,[data-v]').forEach(x=>x.classList.toggle('active',x.dataset.v===v));
  const renderers={dashboard:renderDashboard,coach:renderCoach,library:renderLibrary,nutrition:renderNutrition,challenges:renderChallenges,leaderboard:renderLeaderboard,progress:renderProgress,profile:renderProfile,xpstore:renderXpStore,delete:renderDeleteView,forgot:renderForgotView,premium:renderPremium,paywall:renderPaywall,assistant:renderAssistant,trainer:renderTrainer,checkout:renderFakeCheckout,yoga:renderYoga};
  if(v!=='coach') stopCamera();
  // Leaving Nutrition with a live food preview abandons the camera stream —
  // release it or it holds memory (and the camera light) indefinitely.
  if(v!=='nutrition'){ try{ stopFoodCam(); }catch(e){} }
  // Leaving AI Coach abandons the stale exercise page (camera is already off),
  // so reopening Coach always lands on the exercise picker — never a dead session.
  if(v!=='coach' && state.coach && state.coach.selectedExercise){
    state.coach.selectedExercise=null;
    state.coach.reps=0; state.coach.sets=1; state.coach.seconds=0; state.coach.holdSeconds=0;
  }
  stopFoodCam(); // never leak the nutrition camera across pages
  if(renderers[v]) renderers[v]();
  // Close drawer + topbar popups on nav
  closeDrawer();
  try{ closeProfileMenu(); hideSuggestPopup(); }catch(e){}
  updateBackBtn();
  try{ saveStateToStorage(); }catch(e){} // remember the page across reloads
}

/* ================= PREMIUM: AI WORKOUT & DIET PLANS (ported same-to-same from v27 reference) ================= */
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

function unlockPremium(){
  state.premium = true;
  saveStateToStorage();
  toast('<b>✨ Premium Unlocked</b><br>AI plans are ready to generate.');
  try{ if(typeof Voice!=='undefined' && Voice && Voice.say) Voice.say('Premium unlocked. Your AI plans are ready.', {level:'hi', force:true}); }catch(e){}
  renderDashboard();
}

let paywallBilling='monthly';
function paywallSetBilling(b){ paywallBilling=b; renderPaywall(); }
function checkoutAmount(){
  // paise-equivalent display only — no real charge. TEST ONLY.
  return paywallBilling==='yearly'
    ? {label:'Premium Yearly', sub:'₹179/mo × 12', total:'₹2,148'}
    : {label:'Premium Monthly', sub:'₹299/mo, billed monthly', total:'₹299'};
}
function confirmUpgrade(){
  // Fake checkout stand-in — swap with real Razorpay later.
  setView('checkout');
}
let fakePayMethod='upi';
function fakeSetPayMethod(m){ fakePayMethod=m; renderFakeCheckout(); }
function openFakeCheckout(){ setView('checkout'); }
function cancelFakeCheckout(){ setView('paywall'); }
function renderFakeCheckout(){
  const amt = checkoutAmount();
  el('view-checkout').innerHTML = `
    <div class="paywall-wrap">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="cancelFakeCheckout()">←</button>
        <h1 class="display" style="font-size:24px;">Checkout</h1>
      </div>
      <p class="paywall-sub">Complete your upgrade — TEST ONLY, no real money moves.</p>
      <div class="fake-pay-badge">⚠️ FAKE PAYMENT PAGE — FOR TESTING ONLY</div>
      <div class="fake-order">
        <div class="fake-order-row"><span>${amt.label}</span><span class="small-muted">${amt.sub}</span></div>
        <div class="fake-order-row"><span>GST (included)</span><span>₹0</span></div>
        <div class="fake-order-row total"><span>Total due today</span><span>${amt.total}</span></div>
      </div>
      <div class="card">
        <div class="card-title">Pay with UPI (fake)</div>
        <div class="field"><label>UPI ID (fake — use anything@test)</label><input id="fake-upi" value="athlete@testupi" placeholder="name@upi"></div>
        <button id="fake-pay-btn" class="btn-upgrade" onclick="fakePayNow()">Pay ${amt.total} (Test)</button>
        <button class="btn btn-ghost btn-block mt" onclick="cancelFakeCheckout()">Cancel</button>
        <p class="small-muted mt">This is a placeholder. Replace <b>fakePayNow()</b> with Razorpay Checkout + backend <b>/api/billing/verify</b> before going live.</p>
      </div>
    </div>`;
}
function fakePayNow(){
  const btn = el('fake-pay-btn');
  setBtnLoading(btn, true);
  el('view-checkout').insertAdjacentHTML('beforeend', `<div id="fake-processing" style="text-align:center;"><div class="fake-spinner"></div><p class="small-muted">Contacting fake bank…</p></div>`);
  setTimeout(()=>{
    const txnId = 'FAKE_' + Math.random().toString(36).slice(2,10).toUpperCase();
    unlockPremium();
    toast(`<b>🎉 Welcome to Premium</b><br>${paywallBilling==='yearly'?'Yearly':'Monthly'} plan activated (TEST). Txn: ${txnId}`);
    setView('premium');
  }, 1500);
}
function renderPaywall(){
  const monthlyPrice = 299, yearlyMonthlyEquiv = 179, yearlyTotal = yearlyMonthlyEquiv*12;
  const isYearly = paywallBilling==='yearly';
  const priceHtml = isYearly
    ? `₹${yearlyMonthlyEquiv}<span>/month, billed ₹${yearlyTotal} yearly</span>`
    : `₹${monthlyPrice}<span>/month</span>`;
  el('view-paywall').innerHTML = `
    <div class="paywall-wrap">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="setView('dashboard')">←</button>
        <h1 class="display" style="font-size:26px;">Go Premium</h1>
      </div>
      <p class="paywall-sub">Unlock your full potential with FitQuest AI</p>

      <div class="billing-toggle">
        <div class="billing-slider" style="transform:translateX(${isYearly?'100%':'0'});"></div>
        <div class="billing-opt ${!isYearly?'on':''}" onclick="paywallSetBilling('monthly')">Monthly</div>
        <div class="billing-opt ${isYearly?'on':''}" onclick="paywallSetBilling('yearly')" style="position:relative;">
          Yearly
          ${isYearly?'':'<span class="save-badge">Save 40%</span>'}
        </div>
      </div>

      <div class="plan-card">
        <div class="plan-card-head">
          <div>
            <div class="plan-name">Free</div>
            <div class="plan-desc">Basic features to get you started</div>
          </div>
        </div>
        <div class="plan-price">₹0<span>/forever</span></div>
        <div class="plan-feature"><span class="ck">✓</span>Basic workouts &amp; challenges</div>
        <div class="plan-feature"><span class="ck">✓</span>Community access</div>
        <div class="plan-feature"><span class="ck">✓</span>Limited analytics</div>
        <button class="btn-current">${state.premium?'Downgrade':'Current Plan'}</button>
      </div>

      <div class="plan-card premium">
        <div class="plan-card-head">
          <div class="plan-name">👑 Premium</div>
          ${state.premium?'':'<span class="most-popular-badge">Most Popular</span>'}
        </div>
        <div class="plan-price">${state.premium?'You\'re subscribed':priceHtml}</div>
        <div class="plan-desc" style="margin-bottom:6px;font-weight:700;color:var(--text);">Everything in Free +</div>
        <div class="plan-feature"><span class="ck">✓</span>Personalized 7-day AI workout &amp; diet plan</div>
        <div class="plan-feature"><span class="ck">✓</span>AI Fitness Assistant — instant fitness Q&amp;A chat</div>
        <div class="plan-feature"><span class="ck">✓</span>Personal Trainer — goal-based weight loss, weight gain &amp; muscle-building programs</div>
        <div class="plan-feature"><span class="ck">✓</span>Premium AI Voice Coach</div>
        <div class="plan-feature"><span class="ck">✓</span>Redeem XP Coins for Premium Fitness Products</div>
        ${state.premium
          ? `<button class="btn-current">Current Plan</button>`
          : `<button class="btn-upgrade" onclick="confirmUpgrade()">Upgrade Now</button>`}
      </div>
    </div>`;
}

/* ---------------- Shared goal/level personalization engine ---------------- */
const GOAL_ROTATIONS = {
  'Build Strength':  ['Upper Body','Lower Body','Core','Upper Body','Lower Body','Full Body','Rest'],
  'Lose Weight':      ['Cardio','Full Body','Cardio','Lower Body','Cardio','Full Body','Rest'],
  'Improve Stamina':  ['Cardio','Cardio','Full Body','Cardio','Cardio','Full Body','Rest'],
  'Stay Active':      ['Full Body','Cardio','Upper Body','Lower Body','Cardio','Core','Rest'],
  'Improve Fitness':  ['Full Body','Upper Body','Cardio','Lower Body','Core','Full Body','Rest'],
  'Gain Weight':      ['Upper Body','Lower Body','Full Body','Upper Body','Lower Body','Core','Rest'],
  'Build Muscle':     ['Upper Body','Lower Body','Core','Full Body','Upper Body','Lower Body','Rest'],
  'Maintain & Tone':  ['Full Body','Cardio','Upper Body','Lower Body','Cardio','Core','Rest'],
};
function allowedDifficultyForLevel(level, avgForm){
  const lvlOrder = {'Beginner':0,'Intermediate':1,'Advanced':2};
  const userLvl = lvlOrder[level] ?? 0;
  let allowed = userLvl===0 ? ['Beginner'] : userLvl===1 ? ['Beginner','Intermediate'] : ['Beginner','Intermediate','Advanced'];
  if(avgForm>=92 && userLvl<2) allowed = [...allowed, userLvl===0?'Intermediate':'Advanced'];
  return allowed;
}
function pickExercisesForFocus(focus, allowedDiff, count){
  const pool = EXERCISES.filter(e=>allowedDiff.includes(e.difficulty));
  const matches = pool.filter(e => focus==='Full Body' ? true : e.category.includes(focus));
  return shuffle([...(matches.length?matches:pool)]).slice(0,count);
}
function currentAvgForm(){
  return state.formScores.length ? Math.round(state.formScores.reduce((a,b)=>a+b,0)/state.formScores.length) : 75;
}

/* ================= BLUETOOTH HEART RATE (ported same-to-same from v27 reference) ================= */
// Connects to BLE devices exposing the standard Heart Rate Service (0x180D).
// Apple Watch and Fitbit expose no third-party BLE service, so they cannot
// be reached from any browser — their data is cloud-API only.
const HR_SERVICE = 'heart_rate';
const HR_CHARACTERISTIC = 'heart_rate_measurement';
let hrDevice = null, hrCharacteristic = null;
let currentHr = 0, hrSamples = [];

function bluetoothSupported(){ return typeof navigator !== 'undefined' && !!navigator.bluetooth; }

function parseHeartRate(dataView){
  // Per BLE spec: bit 0 of the flags byte selects uint8 vs uint16 HR format.
  const flags = dataView.getUint8(0);
  return (flags & 0x01) ? dataView.getUint16(1, true) : dataView.getUint8(1);
}
function onHrChanged(event){
  const bpm = parseHeartRate(event.target.value);
  if(!bpm) return;
  currentHr = bpm;
  hrSamples.push(bpm);
  if(hrSamples.length > 3000) hrSamples = hrSamples.slice(-3000);
  const v = el('ls-hr'); if(v) v.textContent = bpm;
  const vd = el('ls-hr-dash'); if(vd) vd.textContent = bpm;
  const z = el('ls-hr-zone'); if(z){ const zn = hrZone(bpm); z.textContent = zn.name; z.style.color = zn.color; }
  const badge = el('hr-connect-status'); if(badge) badge.textContent = `🟢 ${hrDevice && hrDevice.name ? hrDevice.name : 'Device'} · ${bpm} BPM`;
}
// Zones derived from estimated max HR (220 − age), the standard field formula.
function hrZone(bpm){
  const age = (state.profile && state.profile.age) ? Number(state.profile.age) : 30;
  const maxHr = 220 - age;
  const pct = bpm / maxHr;
  if(pct < 0.60) return {name:'Warm Up',   color:'var(--blue)'};
  if(pct < 0.70) return {name:'Fat Burn',  color:'var(--green)'};
  if(pct < 0.80) return {name:'Cardio',    color:'#ffb347'};
  if(pct < 0.90) return {name:'Peak',      color:'var(--coral)'};
  return {name:'Maximum', color:'var(--coral)'};
}
function avgHr(){
  if(!hrSamples.length) return 0;
  return Math.round(hrSamples.reduce((a,b)=>a+b,0)/hrSamples.length);
}
// HR-based energy expenditure (Keytel et al.) — more accurate than the
// flat MET estimate when a monitor is connected.
function hrCalories(minutes){
  if(!hrSamples.length || !minutes) return 0;
  const p = state.profile||{};
  const age = Number(p.age)||30, weight = Number(p.weight)||70;
  const hr = avgHr();
  const male = (p.gender||'').toLowerCase().startsWith('m');
  const kcalPerMin = male
    ? (-55.0969 + 0.6309*hr + 0.1988*weight + 0.2017*age)/4.184
    : (-20.4022 + 0.4472*hr - 0.1263*weight + 0.074*age)/4.184;
  return Math.max(0, Math.round(kcalPerMin*minutes));
}

async function connectHeartRateDevice(){
  if(!bluetoothSupported()){
    toast("<b>Bluetooth unavailable</b><br>Web Bluetooth needs Chrome or Edge on Android, Windows, macOS or Linux. iPhone and iPad don't support it.");
    return;
  }
  try{
    toast('<b>🔍 Scanning…</b><br>Put your watch or strap in pairing mode.');
    hrDevice = await navigator.bluetooth.requestDevice({
      filters:[{services:[HR_SERVICE]}],
      optionalServices:[HR_SERVICE],
    });
    hrDevice.addEventListener('gattserverdisconnected', onHrDisconnected);
    const server  = await hrDevice.gatt.connect();
    const service = await server.getPrimaryService(HR_SERVICE);
    hrCharacteristic = await service.getCharacteristic(HR_CHARACTERISTIC);
    await hrCharacteristic.startNotifications();
    hrCharacteristic.addEventListener('characteristicvaluechanged', onHrChanged);
    hrSamples = [];
    toast(`<b>⌚ Connected</b><br>${esc(hrDevice.name||'Device')} is now streaming heart rate.`);
    try{ if(typeof Voice!=='undefined' && Voice && Voice.say) Voice.say('Heart rate monitor connected.', {level:'hi', force:true}); }catch(e){}
    if(state.view==='coach') renderCoach();
    if(state.view==='dashboard') renderDashboard();
  }catch(err){
    if(err && err.name === 'NotFoundError'){
      toast('<b>No device selected</b><br>Make sure your watch is in pairing mode and broadcasting heart rate.');
    } else {
      toast('<b>Connection failed</b><br>'+esc((err && err.message) ? err.message : 'Unknown Bluetooth error'));
    }
  }
}
function onHrDisconnected(){
  currentHr = 0;
  hrCharacteristic = null;
  toast('<b>⌚ Device disconnected</b>');
  if(state.view==='coach') renderCoach();
  if(state.view==='dashboard') renderDashboard();
}
function disconnectHeartRateDevice(){
  if(hrDevice && hrDevice.gatt && hrDevice.gatt.connected) hrDevice.gatt.disconnect();
  hrDevice = null; hrCharacteristic = null; currentHr = 0;
  if(state.view==='dashboard') renderDashboard();
  if(state.view==='coach') renderCoach();
}
function hrConnected(){ return !!(hrDevice && hrDevice.gatt && hrDevice.gatt.connected); }

/* ================= STEP TRACKER, automatic only (ported same-to-same from v27 reference) ================= */
const STEP_GOAL = 8000;
const STEP_XP_PER_1000 = 8;
const STEP_STRIDE_M = 0.762; // average adult stride length, used to estimate distance
let stepTrackingActive = false;
let stepPermissionNeeded = false; // true only on browsers (iOS Safari) that require a tap to grant motion access
let lastStepTime = 0;
function getTodaySteps(){
  const todayKey = new Date().toDateString();
  if(!state.steps || state.steps.dateKey !== todayKey){
    state.steps = {dateKey:todayKey, count:0, xpMilestone:0};
  }
  return state.steps;
}
function stepsToDistanceKm(count){
  return (count*STEP_STRIDE_M/1000);
}
function awardStepXp(s){
  const milestonesReached = Math.floor(s.count/1000);
  if(milestonesReached > s.xpMilestone){
    const newMilestones = milestonesReached - s.xpMilestone;
    s.xpMilestone = milestonesReached;
    addXp(newMilestones*STEP_XP_PER_1000, `${milestonesReached*1000} steps walked`);
  }
}
function handleStepMotion(e){
  const acc = e.accelerationIncludingGravity || e.acceleration;
  if(!acc) return;
  const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
  const now = Date.now();
  if(mag > 13 && now - lastStepTime > 320){
    lastStepTime = now;
    const s = getTodaySteps();
    s.count += 1;
    awardStepXp(s);
    const countEl = el('steps-count-live');
    if(countEl) countEl.textContent = s.count.toLocaleString();
    const distEl = el('steps-distance-live');
    if(distEl) distEl.textContent = stepsToDistanceKm(s.count).toFixed(2)+' km';
    const barEl = el('steps-bar-inner');
    if(barEl) barEl.style.width = Math.min(100,(s.count/STEP_GOAL)*100)+'%';
    if(s.count % 5 === 0) saveStateToStorage();
  }
}
function startStepListener(){
  if(stepTrackingActive) return;
  stepTrackingActive = true;
  window.addEventListener('devicemotion', handleStepMotion);
}
// Called once on login. Starts automatically wherever the browser allows
// it without a user gesture (Android/most browsers). iOS Safari requires
// an explicit tap — for those, the dashboard shows a one-tap "Enable" prompt.
function autoStartStepTracking(){
  if(!('DeviceMotionEvent' in window)) return; // no sensor support — tracker just won't show live data
  if(typeof DeviceMotionEvent.requestPermission === 'function'){
    stepPermissionNeeded = true;
    return;
  }
  startStepListener();
}
// The one unavoidable tap on iOS — browsers block sensor access without
// a direct user gesture, so this can't be triggered automatically.
async function enableStepTrackingTap(){
  try{
    const res = await DeviceMotionEvent.requestPermission();
    if(res !== 'granted'){ toast('<b>Motion access denied</b><br>Step tracking needs this permission to run automatically.'); return; }
  }catch(e){ toast('<b>Motion access unavailable</b> on this device.'); return; }
  stepPermissionNeeded = false;
  startStepListener();
  toast('<b>👟 Step tracking enabled</b><br>Steps now count automatically as you walk.');
  renderDashboard();
}

/* ================= DAILY SPIN WHEEL (ported same-to-same from v27 reference) ================= */
const SPIN_SEGMENTS = [10,20,15,50,10,100,25,30]; // XP prizes, 8 equal segments
const SPIN_COLORS   = ['#d4ff3f','#4fc3f7','#b48cff','#ff5d5d','#3ddc97','#ffb347','#4fc3f7','#b48cff'];
function canSpinToday(){
  return state.lastSpinDate !== new Date().toDateString();
}
function spinWheel(){
  if(!canSpinToday()){ toast('<b>Already spun today</b><br>Come back tomorrow for another spin!'); return; }
  const segCount = SPIN_SEGMENTS.length;
  const segAngle = 360/segCount;
  const chosenIdx = Math.floor(Math.random()*segCount);
  const prizeXp = SPIN_SEGMENTS[chosenIdx];
  const extraSpins = 6;
  const targetAngle = 360*extraSpins + (360 - (chosenIdx*segAngle + segAngle/2));
  const wheelEl = el('spin-wheel-disc');
  const btnEl = el('spin-wheel-btn');
  if(btnEl){ btnEl.disabled = true; }
  if(wheelEl){
    wheelEl.style.transition = 'transform 3.4s cubic-bezier(.17,.67,.16,1)';
    wheelEl.style.transform = `rotate(${targetAngle}deg)`;
  }
  state.lastSpinDate = new Date().toDateString();
  saveStateToStorage();
  setTimeout(()=>{
    addXp(prizeXp, 'Daily Spin Wheel prize');
    toast(`<b>🎉 You won ${prizeXp} XP Coins!</b>`);
    try{ if(typeof Voice!=='undefined' && Voice && Voice.say) Voice.say(`You won ${prizeXp} experience points from the spin wheel!`, {level:'hi', force:true}); }catch(e){}
    renderDashboard();
  }, 3450);
}

/* ================= XP STORE (ported same-to-same from v27 reference) ================= */
// Exchange rate: 500 XP Coins = ₹10, i.e. 1 rupee of value = 50 XP.
const XP_COINS_PER_RUPEE = 50;
const FREE_XP_COIN_CAP = 3000; // free users' spendable balance caps here — earning XP/Level is never capped, only the store balance
// Free tier: discount vouchers for outside fitness stores/apps only — no real products.
const XP_STORE_VOUCHERS = [
  {id:'v5',  icon:'🎟️', name:'5% Off Partner Stores',  costXp:400,  desc:'5% discount code for partner fitness stores & apps.'},
  {id:'v10', icon:'🎟️', name:'10% Off Partner Stores', costXp:900,  desc:'10% discount code for partner fitness stores & apps.'},
  {id:'v15', icon:'🎟️', name:'15% Off Partner Stores', costXp:1600, desc:'15% discount code for partner fitness stores & apps.'},
  {id:'v20', icon:'🎟️', name:'20% Off Partner Stores', costXp:2500, desc:'20% discount code for partner fitness stores & apps.'},
];
// Premium tier: real fitness products, priced in ₹ and converted to XP at the same rate.
const XP_STORE_PRODUCTS = [
  {id:'shaker',   icon:'🥤', name:'Protein Shaker Bottle', price:150, desc:'700ml leak-proof shaker with mixer ball.'},
  {id:'bottle',   icon:'💧', name:'FitQuest Water Bottle', price:200, desc:'1L insulated steel bottle.'},
  {id:'gloves',   icon:'🧤', name:'Gym Gloves', price:250, desc:'Padded grip gloves for lifting.'},
  {id:'multivit', icon:'💊', name:'Multivitamin (60 tabs)', price:300, desc:'Daily multivitamin for active lifestyles.'},
  {id:'bands',    icon:'🎗️', name:'Resistance Bands Set', price:350, desc:'5-level resistance band set with door anchor.'},
  {id:'bcaa',     icon:'⚡', name:'BCAA Supplement', price:450, desc:'Branched-chain amino acids, 300g tub.'},
  {id:'mat',      icon:'🧘', name:'Yoga Mat', price:500, desc:'6mm non-slip exercise mat.'},
  {id:'creatine', icon:'🧪', name:'Creatine Monohydrate 250g', price:600, desc:'Pure micronized creatine monohydrate.'},
  {id:'whey',     icon:'🥛', name:'Whey Protein 1kg', price:1800, desc:'24g protein per serving, multiple flavors.'},
].map(i=>({...i, costXp:i.price*XP_COINS_PER_RUPEE}));
function coinBalance(){
  const raw = Math.max(0, state.xp - (state.xpSpent||0));
  return state.premium ? raw : Math.min(raw, FREE_XP_COIN_CAP);
}
function redeemXpItem(id, isProduct){
  const item = (isProduct ? XP_STORE_PRODUCTS : XP_STORE_VOUCHERS).find(i=>i.id===id);
  if(!item) return;
  if(isProduct && !state.premium){
    toast('<b>Premium required</b><br>Real fitness products are a Premium perk — vouchers stay free.');
    setView('paywall');
    return;
  }
  const cost = item.costXp;
  if(coinBalance() < cost){
    toast(`<b>Not enough XP Coins</b><br>You need ${(cost-coinBalance()).toLocaleString()} more XP.`);
    return;
  }
  state.xpSpent = (state.xpSpent||0) + cost;
  state.redeemedItems = state.redeemedItems||[];
  state.redeemedItems.unshift({id:item.id, name:item.name, icon:item.icon, costXp:cost, redeemedAt:new Date().toISOString()});
  if(state.redeemedItems.length>30) state.redeemedItems = state.redeemedItems.slice(0,30);
  saveStateToStorage();
  toast(`<b>🎉 Redeemed!</b><br>${esc(item.name)} — ${cost.toLocaleString()} XP Coins used.`);
  if(state.view==='xpstore' && el('view-xpstore')) renderXpStore();
  else if(el('view-profile')) renderProfile();
}

/* ================= SHARE PANEL (ported style, WhatsApp / Instagram / Facebook / X / Copy) ================= */
const SHARE_XP_REWARD = 50;
const SHARE_URL = 'https://fitquestai.onrender.com/'; // public share link (Render — PC can stay off)
function shareApp(){
  openShareModal();
}
function closeShareModal(){ const m=el('share-modal'); if(m) m.remove(); }
function openShareModal(){
  closeShareModal();
  const url = SHARE_URL;
  const modal = document.createElement('div');
  modal.id = 'share-modal';
  modal.innerHTML = `
  <div class="share-overlay" onclick="if(event.target===this)closeShareModal()">
    <div class="share-card">
      <span class="share-close" onclick="closeShareModal()">✕</span>
      <h3 class="display">📤 Share &amp; Earn</h3>
      <p class="small-muted">Share your link — earn ${SHARE_XP_REWARD} XP Coins, once per day.</p>
      <div class="share-link-row">
        <input id="share-link-input" readonly value="${esc(url)}">
        <button class="btn btn-ghost btn-sm" onclick="shareVia('copy')">Copy</button>
      </div>
      <div class="share-net-grid">
        <button class="share-net-btn" onclick="shareVia('whatsapp')"><span class="sn-ic sn-wa">✆</span>WhatsApp</button>
        <button class="share-net-btn" onclick="shareVia('instagram')"><span class="sn-ic sn-ig">◉</span>Instagram</button>
        <button class="share-net-btn" onclick="shareVia('facebook')"><span class="sn-ic sn-fb">f</span>Facebook</button>
        <button class="share-net-btn" onclick="shareVia('x')"><span class="sn-ic sn-x">𝕏</span>X</button>
      </div>
      <button class="btn btn-ghost btn-sm btn-block mt" onclick="shareVia('copy')">🔗 Copy Link</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  const inp = el('share-link-input');
  if(inp) inp.onclick = ()=>{ inp.select(); };
}
function grantShareReward(){
  if(state.lastShareDate === new Date().toDateString()){
    toast('<b>Already claimed today</b><br>Come back tomorrow for another sharing bonus.');
    return;
  }
  state.lastShareDate = new Date().toDateString();
  addXp(SHARE_XP_REWARD, 'Shared FitQuest AI');
  saveStateToStorage();
  toast(`<b>🎉 Thanks for sharing!</b><br>+${SHARE_XP_REWARD} XP Coins earned.`);
  if(state.view==='profile') renderProfile();
}
function shareVia(net){
  const url = SHARE_URL;
  const text = 'Check out FitQuest AI — an AI-powered fitness coach with voice feedback, personalized plans, and gamified workouts!';
  const encUrl = encodeURIComponent(url), encText = encodeURIComponent(text);
  if(net==='whatsapp'){
    window.open('https://wa.me/?text='+encText+'%20'+encUrl, '_blank');
    grantShareReward();
  } else if(net==='facebook'){
    window.open('https://www.facebook.com/sharer/sharer.php?u='+encUrl, '_blank');
    grantShareReward();
  } else if(net==='x'){
    window.open('https://twitter.com/intent/tweet?text='+encText+'&url='+encUrl, '_blank');
    grantShareReward();
  } else if(net==='instagram'){
    // Instagram has no web share link — copy the link and open Instagram so it can be pasted in a DM/story.
    copyShareLink(true);
    window.open('https://www.instagram.com/', '_blank');
    toast('<b>Link copied!</b><br>Paste it in a DM or story on Instagram.');
    grantShareReward();
  } else {
    copyShareLink(false);
  }
  closeShareModal();
}
function copyShareLink(silent){
  const url = SHARE_URL;
  function done(){
    if(!silent) toast('<b>Link copied!</b><br>Share it with a friend to earn XP.');
    if(!silent) grantShareReward();
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done).catch(()=>fallbackCopy(url, done));
  } else fallbackCopy(url, done);
}
function fallbackCopy(text, done){
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    done();
  }catch(e){ toast('<b>Could not copy</b><br>Copy this link manually: '+text); }
}

/* ================= WORKOUT REMINDERS (ported same-to-same from v27 reference) ================= */
function checkMissedDayReminder(){
  if(!state.history || !state.history.length) return;
  const lastDate = state.history[state.history.length-1].date;
  const todayStr = new Date().toISOString().slice(0,10);
  const daysSince = Math.round((new Date(todayStr) - new Date(lastDate)) / 86400000);
  if(daysSince>=1){
    const msg = daysSince===1
      ? "You missed yesterday's workout — let's get back on track today!"
      : `It's been ${daysSince} days since your last workout — time for a comeback!`;
    toast(`<b>⏰ Workout Reminder</b><br>${msg}`);
    if(state.settings && state.settings.remindersEnabled && 'Notification' in window && Notification.permission==='granted'){
      try{ new Notification('FitQuest AI', {body:msg, tag:'fitquest-reminder'}); }catch(e){}
    }
  }
}
function toggleReminders(){
  if(!state.settings) state.settings = {voiceEnabled:true, remindersEnabled:false};
  if(state.settings.remindersEnabled){
    state.settings.remindersEnabled = false;
    saveStateToStorage();
    renderProfile();
    toast('<b>🔕 Reminders disabled</b>');
    return;
  }
  if(!('Notification' in window)){
    toast("<b>Notifications not supported</b><br>Your browser doesn't support this feature.");
    return;
  }
  Notification.requestPermission().then(perm=>{
    state.settings.remindersEnabled = (perm==='granted');
    saveStateToStorage();
    renderProfile();
    if(perm==='granted') toast("<b>🔔 Reminders enabled</b><br>We'll nudge you if you miss a workout day.");
    else toast('<b>Notifications blocked</b><br>Enable them in your browser settings to get reminders.');
  });
}

/* Premium diet pool: junk food never appears in AI plans (users can still
   log pizza/burger manually in Nutrition — tracking what you ate is honest).
   Staples (Oats, Green Salad) are guaranteed at least once a day. */
const PREMIUM_JUNK = ['Pizza Slice','Burger'];
const PREMIUM_STAPLES = [{meal:'Breakfast', name:'Oats'}, {meal:'Lunch', name:'Green Salad'}];
function buildDietPlan(calGoal, pGoal, cGoal, fGoal){
  const mealSplit=[{meal:'Breakfast',icon:'🌅',pct:0.25},{meal:'Lunch',icon:'☀️',pct:0.35},{meal:'Dinner',icon:'🌙',pct:0.30},{meal:'Snacks',icon:'🍎',pct:0.10}];
  const pool = FOODS.filter(f=>!PREMIUM_JUNK.includes(f.n));
  const dietPlan = mealSplit.map(m=>{
    const target = Math.round((calGoal||2200)*m.pct);
    const items=[]; let kcal=0;
    for(const f of shuffle([...pool])){
      if(items.some(x=>x.n===f.n)) continue;
      if(kcal + f.kcal <= target*1.1){ items.push(f); kcal+=f.kcal; }
      if(kcal>=target*0.85) break;
    }
    if(!items.length) items.push(pick(pool));
    return {meal:m.meal, icon:m.icon, target, items, totals:{kcal:0,p:0,c:0,f:0}};
  });
  for(const s of PREMIUM_STAPLES){
    if(dietPlan.some(m=>m.items.some(i=>i.n===s.name))) continue;
    const food = FOODS.find(f=>f.n===s.name);
    const slot = dietPlan.find(m=>m.meal===s.meal);
    if(food && slot) slot.items.push(food);
  }
  for(const m of dietPlan){
    m.totals = m.items.reduce((a,f)=>({kcal:a.kcal+f.kcal,p:a.p+f.p,c:a.c+f.c,f:a.f+f.f}),{kcal:0,p:0,c:0,f:0});
    m.totals = {kcal:Math.round(m.totals.kcal),p:Math.round(m.totals.p),c:Math.round(m.totals.c),f:Math.round(m.totals.f)};
  }
  const dietTotals = dietPlan.reduce((a,m)=>({kcal:a.kcal+m.totals.kcal,p:a.p+m.totals.p,c:a.c+m.totals.c,f:a.f+m.totals.f}),{kcal:0,p:0,c:0,f:0});
  return {dietPlan, dietTotals};
}

function generatePremiumPlan(){
  const p = state.profile||{};
  const avgForm = currentAvgForm();
  const allowedDiff = allowedDifficultyForLevel(p.level, avgForm);

  const goal = p.goal || 'Improve Fitness';
  const focusPlan = GOAL_ROTATIONS[goal] || GOAL_ROTATIONS['Improve Fitness'];

  const volMult = avgForm>=90 ? 1.15 : avgForm<65 ? 0.85 : 1.0;
  const setTarget = avgForm<60 ? 2 : 3;

  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const workoutPlan = focusPlan.map((focus,i)=>{
    if(focus==='Rest'){
      return {day:dayNames[i], focus:'Rest & Recovery', exercises:[], note:'Active recovery — light stretching or a walk.'};
    }
    let picks = pickExercisesForFocus(focus, allowedDiff, 3);
    return {
      day:dayNames[i], focus,
      exercises: picks.map(e=>({
        id:e.id, name:e.name, icon:e.icon,
        reps: e.engine==='hold' ? Math.max(15,Math.round(e.reps*volMult))+'s hold' : Math.max(6,Math.round(e.reps*volMult))+' reps',
        sets:setTarget,
      })),
    };
  });

  const n = state.nutrition;
  const {dietPlan, dietTotals} = buildDietPlan(n.calGoal, n.pGoal, n.cGoal, n.fGoal);

  state.premiumPlan = {
    generatedAt: new Date().toISOString(),
    goal, level: p.level||'Beginner', avgFormAtGeneration: avgForm,
    workoutPlan, dietPlan, dietTotals,
  };
  saveStateToStorage();
}

let premiumDayIdx = 0;
function premiumSetDay(i){ premiumDayIdx=i; renderPremium(); }
function renderPremium(){
  if(!state.premium){
    el('view-premium').innerHTML = `
      <div class="pagehead"><div><h1 class="display">Premium</h1><p>Unlock AI-generated workout &amp; diet plans.</p></div></div>
      <div class="card premium-card" style="max-width:520px;">
        <div class="card-title">✨ Premium — AI Workout &amp; Diet Plans</div>
        <p class="small-muted" style="margin:8px 0 14px;">A full 7-day plan generated from your goal, fitness level, and recent form — workouts and meals, tailored automatically and updated as you improve.</p>
        <button class="btn btn-volt btn-sm" onclick="setView('paywall')">🔓 Unlock Premium</button>
      </div>`;
    return;
  }
  if(!state.premiumPlan){
    el('view-premium').innerHTML = `
      <div class="pagehead"><div><h1 class="display">Premium</h1><p>Your AI plan lives here once generated.</p></div></div>
      <div class="card premium-card" style="max-width:520px;">
        <div class="card-title">🤖 Generate Your Plan</div>
        <p class="small-muted" style="margin:8px 0 14px;">Based on your profile, this builds a 7-day workout split plus a daily meal plan matched to your nutrition targets.</p>
        <button class="btn btn-volt btn-sm" onclick="generatePremiumPlan();renderPremium();">Generate My AI Plan</button>
      </div>
      <div class="card premium-card mt" style="max-width:520px;">
        <div class="card-title">💬 AI Fitness Assistant</div>
        <p class="small-muted" style="margin:8px 0 14px;">Ask anything about workouts, nutrition, recovery, or form — answered instantly.</p>
        <button class="btn btn-ghost btn-sm" onclick="setView('assistant')">Open Assistant →</button>
      </div>
      <div class="card premium-card mt" style="max-width:520px;">
        <div class="card-title">🎯 Personal Trainer</div>
        <p class="small-muted" style="margin:8px 0 14px;">Tell it your current and target weight — get a calorie &amp; macro target, a timeline, and a workout split built for that exact transformation.</p>
        <button class="btn btn-ghost btn-sm" onclick="setView('trainer')">Open Personal Trainer →</button>
      </div>`;
    return;
  }
  const plan = state.premiumPlan;
  const day = plan.workoutPlan[premiumDayIdx];
  el('view-premium').innerHTML = `
    <div class="pagehead">
      <div><h1 class="display">✨ Your Premium AI Plan</h1><p>Built for <b>${esc(plan.goal)}</b> · ${esc(plan.level)} level · form avg at generation: ${plan.avgFormAtGeneration}%</p></div>
      <button class="btn btn-ghost btn-sm" onclick="generatePremiumPlan();renderPremium();">🔄 Regenerate Plan</button>
    </div>

    <div class="card premium-card">
      <div class="premium-card-head">
        <div class="card-title" style="margin:0;">💬 AI Fitness Assistant</div>
      </div>
      <p class="small-muted" style="margin:8px 0 14px;">Ask anything about workouts, nutrition, recovery, or form — answered instantly.</p>
      <button class="btn btn-ghost btn-sm" onclick="setView('assistant')">Open Assistant →</button>
    </div>

    <div class="card premium-card mt">
      <div class="premium-card-head">
        <div class="card-title" style="margin:0;">🎯 Personal Trainer</div>
      </div>
      <p class="small-muted" style="margin:8px 0 14px;">${state.trainerPlan ? `Currently on a <b>${esc(state.trainerPlan.goalType)}</b> program — ${esc(state.trainerPlan.startWeight)}kg → ${esc(state.trainerPlan.targetWeight)}kg.` : 'Get a calorie &amp; macro target, a timeline, and a workout split built for your exact transformation goal.'}</p>
      <button class="btn btn-ghost btn-sm" onclick="setView('trainer')">${state.trainerPlan ? 'View My Program →' : 'Open Personal Trainer →'}</button>
    </div>

    <div class="card mt">
      <div class="card-title" style="margin-bottom:12px;">7-Day Workout Split</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${plan.workoutPlan.map((d,i)=>`<button class="premium-tab ${i===premiumDayIdx?'on':''}" onclick="premiumSetDay(${i})">${d.day}</button>`).join('')}
      </div>
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${day.day} — ${esc(day.focus)}</div>
      ${!day.exercises.length ? `
        <p class="small-muted">${esc(day.note||'Rest day.')}</p>
      ` : day.exercises.map(e=>`
        <div class="premium-ex-row">
          <span class="premium-ex-name">${e.icon} ${esc(e.name)}</span>
          <span class="premium-ex-sets">${e.sets} sets × ${e.reps}</span>
          <button class="btn btn-ghost btn-sm" onclick="openCoachWith('${e.id}')">Start ▶</button>
        </div>`).join('')}
    </div>

    <div class="card mt">
      <div class="card-title" style="margin-bottom:4px;">Daily Diet Plan</div>
      <p class="small-muted" style="margin-bottom:14px;">Target ≈ ${plan.dietTotals.kcal} kcal · ${plan.dietTotals.p}g protein · ${plan.dietTotals.c}g carbs · ${plan.dietTotals.f}g fat</p>
      ${plan.dietPlan.map(m=>`
        <div class="premium-meal">
          <div style="font-weight:700;font-size:13.5px;margin-bottom:4px;">${m.icon} ${esc(m.meal)} <span class="small-muted" style="font-weight:400;">· ~${m.totals.kcal} kcal</span></div>
          ${m.items.map(f=>`<div class="premium-meal-item"><span>${f.ic} ${esc(f.n)} (${esc(f.u)})</span><span>${f.kcal} kcal</span></div>`).join('')}
        </div>`).join('')}
    </div>`;
}

/* ================= PERSONAL TRAINER (Premium) ================= */
const TRAINER_GOAL_TYPES = ['Lose Weight','Gain Weight','Build Muscle','Tone & Maintain'];
function calcBMR(weight,height,age,gender){
  const base = 10*weight + 6.25*(height||170) - 5*(age||25);
  if(gender==='Male') return base+5;
  if(gender==='Female') return base-161;
  return base-78;
}
function activityMultiplier(activity){
  return {'Low':1.2,'Moderate':1.55,'High':1.725}[activity] || 1.375;
}
function trainerRateForGoal(goalType){
  return {'Lose Weight':0.5,'Gain Weight':0.3,'Build Muscle':0.25,'Tone & Maintain':0.4}[goalType] ?? 0.4;
}
function trainerCalorieAdjustment(goalType, tdee){
  const adj = {'Lose Weight':-500,'Gain Weight':350,'Build Muscle':250,'Tone & Maintain':0}[goalType] ?? 0;
  return Math.max(1200, Math.round(tdee+adj));
}
function trainerProteinPerKg(goalType){
  return {'Lose Weight':2.0,'Gain Weight':2.0,'Build Muscle':2.2,'Tone & Maintain':1.6}[goalType] ?? 1.8;
}
function trainerRotationForGoal(goalType){
  return {
    'Lose Weight': GOAL_ROTATIONS['Lose Weight'],
    'Gain Weight': GOAL_ROTATIONS['Build Strength'],
    'Build Muscle': GOAL_ROTATIONS['Build Strength'],
    'Tone & Maintain': GOAL_ROTATIONS['Improve Fitness'],
  }[goalType] || GOAL_ROTATIONS['Improve Fitness'];
}
function generateTrainerPlan(goalType, currentWeight, targetWeight){
  const p = state.profile||{};
  const bmr = Math.round(calcBMR(currentWeight, p.height, p.age, p.gender));
  const tdee = Math.round(bmr * activityMultiplier(p.activity));
  const calorieTarget = trainerCalorieAdjustment(goalType, tdee);
  const proteinG = Math.round(trainerProteinPerKg(goalType)*currentWeight);
  const proteinCals = proteinG*4;
  const fatCals = calorieTarget*0.25;
  const fatG = Math.round(fatCals/9);
  const carbG = Math.max(50, Math.round((calorieTarget-proteinCals-fatCals)/4));

  const diff = Math.abs(targetWeight-currentWeight);
  const rate = trainerRateForGoal(goalType);
  const totalWeeks = diff>0.15 ? Math.max(1,Math.ceil(diff/rate)) : 0;

  const rotation = trainerRotationForGoal(goalType);
  const allowedDiff = allowedDifficultyForLevel(p.level, currentAvgForm());
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weeklySplit = rotation.map((focus,i)=>{
    if(focus==='Rest') return {day:dayNames[i], focus:'Rest & Recovery', exercises:[]};
    const picks = pickExercisesForFocus(focus, allowedDiff, 3);
    return {day:dayNames[i], focus, exercises:picks.map(e=>({
      id:e.id, name:e.name, icon:e.icon,
      reps: e.engine==='hold' ? Math.round(e.reps)+'s hold' : Math.round(e.reps)+' reps',
      sets:3,
    }))};
  });

  state.trainerPlan = {
    goalType, startWeight:currentWeight, targetWeight,
    createdAt:new Date().toISOString(),
    bmr, tdee, calorieTarget, proteinG, carbG, fatG, rate, totalWeeks, weeklySplit,
  };
  state.weightLog = state.weightLog||[];
  state.weightLog.push({date:new Date().toISOString().slice(0,10), weight:currentWeight});
  saveStateToStorage();
}
function logTrainerWeight(){
  const inp = el('trainer-weight-input');
  const val = parseFloat(inp.value);
  if(!val || val<=0 || val>400){ toast('<b>Enter a valid weight</b>'); return; }
  state.weightLog = state.weightLog||[];
  state.weightLog.push({date:new Date().toISOString().slice(0,10), weight:val});
  if(state.weightLog.length>60) state.weightLog = state.weightLog.slice(-60);
  saveStateToStorage();
  toast('<b>⚖️ Weight logged</b><br>Your progress has been updated.');
  renderTrainer();
}
function trainerLatestWeight(){
  const log = state.weightLog||[];
  return log.length ? log[log.length-1].weight : (state.trainerPlan ? state.trainerPlan.startWeight : (state.profile.weight||70));
}
function resetTrainerPlan(){
  state.trainerPlan = null;
  saveStateToStorage();
  renderTrainer();
}
let trainerDayIdx = 0;
function trainerSetDay(i){ trainerDayIdx=i; renderTrainer(); }
function renderTrainer(){
  const p = state.profile||{};
  if(!state.trainerPlan){
    el('view-trainer').innerHTML = `
      <div class="paywall-wrap" style="max-width:520px;">
        <div class="paywall-back">
          <button class="paywall-back-btn" onclick="setView('premium')">←</button>
          <h1 class="display" style="font-size:24px;">🎯 Personal Trainer</h1>
        </div>
        <p class="paywall-sub">Set your goal and get a calorie target, macros, a timeline, and a workout split built for it.</p>
        <div class="card">
          <div class="field"><label>Goal</label>
            <select id="trainer-goal">${TRAINER_GOAL_TYPES.map(g=>`<option>${g}</option>`).join('')}</select>
          </div>
          <div class="row2">
            <div class="field"><label>Current Weight (kg)</label><input id="trainer-current" type="number" value="${p.weight||70}"></div>
            <div class="field"><label>Target Weight (kg)</label><input id="trainer-target" type="number" value="${p.weight||70}"></div>
          </div>
          <p class="small-muted" style="margin:4px 0 14px;">For Build Muscle or Tone &amp; Maintain, you can leave target close to your current weight — the plan still adjusts calories, protein, and training style for that goal.</p>
          <button class="btn btn-volt btn-block" onclick="submitTrainerPlan()">Generate My Program</button>
        </div>
      </div>`;
    return;
  }

  const plan = state.trainerPlan;
  const latest = trainerLatestWeight();
  const totalDist = Math.abs(plan.targetWeight-plan.startWeight);
  const traveled = plan.targetWeight>=plan.startWeight ? (latest-plan.startWeight) : (plan.startWeight-latest);
  const pct = totalDist>0.15 ? clamp(Math.round((traveled/totalDist)*100),0,100) : 100;
  const remainingDist = Math.abs(plan.targetWeight-latest);
  const weeksRemaining = remainingDist>0.15 ? Math.max(1,Math.ceil(remainingDist/plan.rate)) : 0;
  const day = plan.weeklySplit[trainerDayIdx];
  const weightData = (state.weightLog||[]).map(w=>({date:w.date, weight:w.weight}));

  el('view-trainer').innerHTML = `
    <div class="paywall-wrap" style="max-width:640px;">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="setView('premium')">←</button>
        <h1 class="display" style="font-size:24px;">🎯 Your ${esc(plan.goalType)} Program</h1>
      </div>
      <p class="paywall-sub">${esc(plan.startWeight)}kg → ${esc(plan.targetWeight)}kg · ~${plan.rate}kg/week</p>

      <div class="card premium-card">
        <div class="premium-card-head">
          <div class="card-title" style="margin:0;">Progress</div>
          <button class="btn btn-ghost btn-sm" onclick="resetTrainerPlan()">Edit Goal</button>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin:12px 0 4px;">
          <span>${esc(plan.startWeight)}kg</span><span>${esc(plan.targetWeight)}kg</span>
        </div>
        <div class="xp-bar-outer"><div class="xp-bar-inner" style="width:${pct}%"></div></div>
        <p class="small-muted" style="margin-top:10px;">Current: <b style="color:var(--text);">${latest}kg</b> · ${weeksRemaining>0 ? `~${weeksRemaining} week${weeksRemaining!==1?'s':''} to go at this rate` : 'Goal weight reached — nice work!'}</p>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <input id="trainer-weight-input" class="search-box" type="number" placeholder="Log today's weight (kg)" style="flex:1;">
          <button class="btn btn-volt btn-sm" onclick="logTrainerWeight()">Log</button>
        </div>
        ${weightData.length>1 ? miniChart('Weight Log','weight',weightData,'#4fc3f7') : ''}
      </div>

      <div class="card mt">
        <div class="card-title" style="margin-bottom:10px;">Daily Nutrition Target</div>
        <p class="small-muted" style="margin-bottom:12px;">Estimated from your profile (BMR ${plan.bmr} kcal · TDEE ${plan.tdee} kcal) and current weight.</p>
        <div class="macro-grid">
          <div class="stat-tile"><div class="num accent">${plan.calorieTarget}</div><div class="lbl">Calories</div></div>
          <div class="stat-tile"><div class="num accent">${plan.proteinG}g</div><div class="lbl">Protein</div></div>
          <div class="stat-tile"><div class="num accent">${plan.carbG}g</div><div class="lbl">Carbs</div></div>
          <div class="stat-tile"><div class="num accent">${plan.fatG}g</div><div class="lbl">Fat</div></div>
        </div>
      </div>

      <div class="card mt">
        <div class="card-title" style="margin-bottom:12px;">Weekly Workout Split</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          ${plan.weeklySplit.map((d,i)=>`<button class="premium-tab ${i===trainerDayIdx?'on':''}" onclick="trainerSetDay(${i})">${d.day}</button>`).join('')}
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${day.day} — ${esc(day.focus)}</div>
        ${!day.exercises.length ? `
          <p class="small-muted">Rest &amp; recovery day.</p>
        ` : day.exercises.map(e=>`
          <div class="premium-ex-row">
            <span class="premium-ex-name">${e.icon} ${esc(e.name)}</span>
            <span class="premium-ex-sets">${e.sets} sets × ${e.reps}</span>
            <button class="btn btn-ghost btn-sm" onclick="openCoachWith('${e.id}')">Start ▶</button>
          </div>`).join('')}
      </div>
      <p class="small-muted mt" style="max-width:560px;">This is general fitness guidance based on standard formulas, not medical advice — check with a doctor before major changes to diet or training, especially with any existing health condition.</p>
    </div>`;
}
function submitTrainerPlan(){
  const goalType = el('trainer-goal').value;
  const current = parseFloat(el('trainer-current').value);
  const target = parseFloat(el('trainer-target').value);
  if(!current || current<=0 || current>400 || !target || target<=0 || target>400){
    toast('<b>Enter valid weights</b><br>Please check the values you entered.');
    return;
  }
  generateTrainerPlan(goalType, current, target);
  renderTrainer();
}

/* ================= AI FITNESS ASSISTANT (Premium) ================= */
const ASSISTANT_KB = [
  {kw:['protein','how much protein'], a:"A common target is roughly 1.6–2.2g of protein per kg of bodyweight per day if you're strength training — spread across 3–4 meals helps with absorption. Check the Nutrition AI tab to see how your logged meals stack up against your protein goal."},
  {kw:['weight loss','lose weight','fat loss','cutting'], a:"Weight loss comes down to a consistent calorie deficit — pair strength training (to preserve muscle) with some cardio, and prioritize protein so you stay full. Your AI plan's 'Lose Weight' rotation already leans on cardio + full-body circuits for this."},
  {kw:['build muscle','muscle gain','bulking','gain weight','hypertrophy'], a:"Muscle growth needs a slight calorie surplus, enough protein (~1.6-2.2g/kg), and progressive overload — gradually increasing reps, sets, or difficulty over time. Your Premium plan already scales volume up as your form score improves."},
  {kw:['sore','soreness','doms','muscle pain after'], a:"Muscle soreness 1–2 days after a workout (DOMS) is normal and usually fades within 48–72 hours. Light movement, hydration, and sleep help. If it's a sharp, sudden, or joint-specific pain rather than a dull ache, stop and consider resting that area or seeing a professional."},
  {kw:['rest day','how many rest days','recovery day','overtraining'], a:"Most people do well with 1–2 rest or active-recovery days per week, more if you're a beginner or training intensely. Your AI plan already schedules a rest day — recovery is when your muscles actually adapt and get stronger."},
  {kw:['hydration','water','how much water','drink water'], a:"A common baseline is about 30–35ml of water per kg of bodyweight per day, more on workout days or in hot weather. Thirst and pale-yellow urine are decent everyday indicators you're keeping up."},
  {kw:['warm up','warmup','before workout'], a:"5–10 minutes of light cardio (brisk walk, jumping jacks) plus dynamic stretches or bodyweight versions of your planned moves is a solid warm-up — it raises your heart rate and preps the joints before loading them."},
  {kw:['cool down','cooldown','after workout','stretch after'], a:"A few minutes of light walking plus static stretching on the muscles you trained helps bring your heart rate down gradually and can reduce next-day stiffness."},
  {kw:['beginner','just starting','new to fitness','where do i start'], a:"Start with 2–3 full-body sessions a week, focusing on form over weight or reps — the AI Coach here will score your form live. Bodyweight moves like Squats, Push-ups, and Glute Bridges from the Exercise Library are great starting points."},
  {kw:['sets and reps','how many sets','how many reps','reps and sets'], a:"For general fitness, 3 sets of 8–15 reps per exercise is a solid default — lower reps (4–6) with heavier effort for strength, higher reps (12–20) for endurance. Your AI plan already picks a rep range based on your level and recent form."},
  {kw:['cardio vs strength','cardio or weights','which is better cardio'], a:"They do different jobs — strength training builds and preserves muscle (which also raises resting metabolism), cardio is efficient for heart health and burning calories in the moment. Most well-rounded plans use both, which is why your AI plan mixes focus days."},
  {kw:['motivation','stay consistent','lazy','skip workout','no motivation'], a:"Consistency usually beats intensity — showing up for a short, easy session beats skipping entirely. Try shrinking the ask on low-motivation days (even 10 minutes counts), and lean on the streak tracker and challenges here to build momentum."},
  {kw:['injury','pain','hurts','sharp pain','joint pain'], a:"Sharp, sudden, or joint-specific pain is different from normal muscle fatigue — it's worth stopping that exercise and, if it persists, seeing a doctor or physiotherapist. This assistant gives general fitness guidance, not medical advice."},
  {kw:['sleep','how much sleep'], a:"Most adults do best with 7–9 hours — sleep is when a lot of muscle repair and recovery actually happens, and poor sleep can hurt both performance and appetite regulation."},
  {kw:['supplement','creatine','protein powder','pre workout'], a:"Whole food first — supplements just fill gaps. Creatine monohydrate and a basic protein powder are among the most evidence-backed if you want to supplement, but they're not required to make progress. Check with a doctor if you're on any medication."},
  {kw:['form','proper form','technique'], a:"Good form is about controlled range of motion and consistent joint alignment more than raw weight or speed. Open the AI Coach and pick your exercise — it scores posture, alignment, and depth live as you move."},
  {kw:['no equipment','home workout','bodyweight'], a:"Squats, Push-ups, Lunges, Glute Bridges, Plank, and Jumping Jacks — all in your Exercise Library — need zero equipment and can be combined into a full workout. Your AI plan already draws from these when it builds your split."},
  {kw:['calorie deficit','how many calories','calorie goal'], a:"Your daily calorie target is set in the Nutrition AI tab based on your goal — a deficit for fat loss, a slight surplus for muscle gain, or maintenance for general fitness. Your Premium diet plan is built around that same number."},
];
const ASSISTANT_FALLBACKS = [
  "I don't have a solid answer for that one specifically — try asking about nutrition, reps/sets, recovery, or form, and I'll do my best.",
  "That's a bit outside what I can answer confidently. I'm best with workout structure, nutrition basics, and recovery questions.",
];
function matchAssistantAnswer(msg){
  const text = msg.toLowerCase();
  let best=null, bestScore=0;
  ASSISTANT_KB.forEach(entry=>{
    let score=0;
    entry.kw.forEach(k=>{ if(text.includes(k)) score += k.split(' ').length; });
    if(score>bestScore){ bestScore=score; best=entry; }
  });
  return best ? best.a : pick(ASSISTANT_FALLBACKS);
}
const ASSISTANT_SUGGESTIONS = ["How much protein do I need?","Best exercises for beginners?","How many rest days per week?","How do I stay motivated?"];

function renderAssistant(){
  const chat = state.assistantChat||[];
  el('view-assistant').innerHTML = `
    <div class="paywall-wrap" style="max-width:640px;">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="setView('premium')">←</button>
        <h1 class="display" style="font-size:24px;">💬 AI Fitness Assistant</h1>
      </div>
      <p class="paywall-sub">Ask about workouts, nutrition, recovery, or form. General guidance only — not medical advice.</p>

      <div class="card" style="padding:14px;">
        <div class="assistant-thread" id="assistant-thread">
          ${!chat.length ? `<div class="assistant-empty">Ask me anything about your training — try one of the suggestions below.</div>` : chat.map(m=>`
            <div class="assistant-msg ${m.role}">${esc(m.text)}</div>
          `).join('')}
        </div>
        <div class="assistant-suggestions">
          ${ASSISTANT_SUGGESTIONS.map(s=>`<button class="premium-tab" onclick='sendAssistantMsg(${JSON.stringify(s)})'>${esc(s)}</button>`).join('')}
        </div>
        <div class="assistant-input-row">
          <input id="assistant-input" class="search-box" placeholder="Type your question..." onkeydown="if(event.key==='Enter'){sendAssistantMsgFromInput();}">
          <button class="btn btn-volt btn-sm" onclick="sendAssistantMsgFromInput()">Send</button>
        </div>
      </div>
    </div>`;
  const thread = el('assistant-thread');
  if(thread) thread.scrollTop = thread.scrollHeight;
}
function sendAssistantMsgFromInput(){
  const inp = el('assistant-input');
  const val = (inp.value||'').trim();
  if(!val) return;
  inp.value='';
  sendAssistantMsg(val);
}
function sendAssistantMsg(text){
  if(!text || !text.trim()) return;
  state.assistantChat.push({role:'user', text, at:Date.now()});
  const answer = matchAssistantAnswer(text);
  state.assistantChat.push({role:'ai', text:answer, at:Date.now()});
  if(state.assistantChat.length>60) state.assistantChat = state.assistantChat.slice(-60);
  saveStateToStorage();
  renderAssistant();
}

/* ================= DASHBOARD ================= */
/* ================= DAILY WATER TARGET (ported same-to-same from index reference) ================= */
// Daily target from the age and weight given at sign-up:
// weight (kg) x an age-based rate (40 ml/kg under 30, 35 ml/kg 30-55, 30 ml/kg over 55).
// General guideline, not medical advice.
function dailyWaterTarget(profile){
  const p = profile || {};
  const w = Number(p.weight), a = Number(p.age);
  if(!(w>20 && w<300) || !(a>5 && a<110)) return null;
  const perKg = a<30 ? 40 : (a<=55 ? 35 : 30);
  const ml = clamp(Math.round(w*perKg/50)*50, 1500, 4500);
  return {ml, litres:(ml/1000).toFixed(2).replace(/0$/,'').replace(/\.$/,''), glasses:Math.round(ml/250)};
}
function renderWaterHeading(){
  const t = dailyWaterTarget(state.profile);
  return t
    ? `💧 Drink <b>${t.litres} litres</b> of water today <span class="water-head-sub">(about ${t.glasses} glasses)</span>`
    : `💧 Add your age and weight in Profile to see how much water to drink each day`;
}

/* ================= MORNING READINESS CHECK-IN (ported same-to-same from v27 reference) ================= */
// Three quick taps each morning (sleep / energy / soreness), each worth
// -1/0/+1. The combined score (-3..+3) nudges the same avgForm signal that
// already drives today's suggested-workout volume.
const READINESS_QS = [
  {key:'sleep', label:'😴 Sleep last night', opts:[{v:-1,label:'Poor'},{v:0,label:'OK'},{v:1,label:'Great'}]},
  {key:'energy', label:'🔋 Energy level', opts:[{v:-1,label:'Low'},{v:0,label:'Medium'},{v:1,label:'High'}]},
  {key:'soreness', label:'💪 Muscle soreness', opts:[{v:-1,label:'Sore'},{v:0,label:'Some'},{v:1,label:'Fresh'}]},
];
function todaysReadiness(){
  const todayKey = new Date().toDateString();
  return (state.readiness && state.readiness.dateKey===todayKey) ? state.readiness : null;
}
function setReadinessAnswer(key, val){
  const todayKey = new Date().toDateString();
  if(!state.readiness || state.readiness.dateKey!==todayKey){
    state.readiness = {dateKey:todayKey, sleep:null, energy:null, soreness:null, score:null};
  }
  state.readiness[key] = val;
  const answered = READINESS_QS.every(q=>state.readiness[q.key]!==null);
  if(answered){
    state.readiness.score = READINESS_QS.reduce((s,q)=>s+state.readiness[q.key],0); // -3..+3
    state.todaysSuggestionCache = null; // let today's suggestion regenerate with the new signal
    const msg = state.readiness.score<=-2
      ? "Recovery mode — today's suggested volume is scaled down."
      : state.readiness.score>=2
        ? "You're primed — today's suggested volume is scaled up."
        : "Balanced day — sticking with your normal volume.";
    toast(`<b>🌅 Check-in complete</b><br>${msg}`);
  }
  saveStateToStorage();
  renderDashboard();
}
function resetReadinessCheckin(){
  state.readiness = {dateKey:new Date().toDateString(), sleep:null, energy:null, soreness:null, score:null};
  state.todaysSuggestionCache = null;
  saveStateToStorage();
  renderDashboard();
}
function renderReadinessCard(){
  const r = todaysReadiness();
  if(!r || r.score===null){
    const cur = r || {sleep:null, energy:null, soreness:null};
    return `
      <div class="card-title">🌅 Morning Readiness Check-in</div>
      <p class="small-muted" style="margin:4px 0 10px;">3 quick taps — today's suggested workout adjusts to how you're feeling.</p>
      ${READINESS_QS.map(q=>`
        <div class="readiness-row">
          <div class="readiness-label">${q.label}</div>
          <div class="readiness-opts">
            ${q.opts.map(o=>`<button class="readiness-opt ${cur[q.key]===o.v?'on':''}" onclick="setReadinessAnswer('${q.key}',${o.v})">${o.label}</button>`).join('')}
          </div>
        </div>
      `).join('')}`;
  }
  const summary = r.score<=-2 ? 'Recovery mode' : r.score>=2 ? 'Volume up today' : 'Balanced — normal volume';
  const tagClass = r.score<=-2 ? 'down' : r.score>=2 ? 'up' : '';
  return `
    <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
      <span>🌅 Morning Readiness Check-in</span>
      ${tagClass ? `<span class="readiness-tag ${tagClass}">${summary}</span>` : ''}
    </div>
    <p class="small-muted" style="margin:6px 0 12px;">${tagClass ? summary+'. ' : 'Balanced day. '}Reflected in today's suggested workout below.</p>
    <button class="btn btn-ghost btn-sm" onclick="resetReadinessCheckin()">Recheck-in</button>`;
}

// Today's suggestion is cached per calendar day (and regenerated if the
// user edits their goal/level, or completes/redoes the morning check-in)
// so it doesn't reshuffle on every render.
function getTodaysSuggestion(){
  const p = state.profile||{};
  const todayKey = new Date().toDateString();
  const cache = state.todaysSuggestionCache;
  const r = todaysReadiness();
  const readinessScore = (r && r.score!==null) ? r.score : 0;
  if(cache && cache.dateKey===todayKey && cache.goal===p.goal && cache.level===p.level && cache.readinessScore===readinessScore) return cache;

  const goal = p.goal || 'Improve Fitness';
  const rotation = GOAL_ROTATIONS[goal] || GOAL_ROTATIONS['Improve Fitness'];
  const focus = rotation[todayIdx()];
  // Readiness nudges the same form-quality input that already sets volume —
  // no new scaling logic, just a shift applied before the existing thresholds.
  const adjForm = Math.max(0, Math.min(100, currentAvgForm() + readinessScore*8));
  const allowedDiff = allowedDifficultyForLevel(p.level, adjForm);
  const volMult = adjForm>=90 ? 1.15 : adjForm<65 ? 0.85 : 1.0;

  let result;
  if(focus==='Rest'){
    result = {dateKey:todayKey, goal, level:p.level, focus:'Rest & Recovery', exercises:[], readinessScore};
  } else {
    const picks = pickExercisesForFocus(focus, allowedDiff, 3);
    result = {
      dateKey:todayKey, goal, level:p.level, focus, readinessScore,
      exercises: picks.map(e=>({
        id:e.id, name:e.name, icon:e.icon,
        reps: e.engine==='hold' ? Math.max(15,Math.round(e.reps*volMult))+'s hold' : Math.max(6,Math.round(e.reps*volMult))+' reps',
      })),
    };
  }
  state.todaysSuggestionCache = result;
  saveStateToStorage();
  return result;
}

function renderDashboard(){
  const p=state.profile||{};
  const suggestion = getTodaysSuggestion();
  const steps = getTodaySteps();
  const stepsPct = Math.min(100, Math.round((steps.count/STEP_GOAL)*100));
  const lvl=levelForXp(state.xp);
  const pct=Math.round((xpIntoLevel(state.xp)/500)*100);
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const tIdx=todayIdx();
  const nextChal = state.challenges.find(c=>c.progress<c.target) || state.challenges[0];
  const _lbPool = [...state.users.filter(u=>u.email!==state.currentUser.email).map(u=>({name:u.name,xp:u.xp||0})),{name:state.currentUser.name,xp:state.xp,me:true}];
  const myRank = _lbPool.sort((a,b)=>b.xp-a.xp).findIndex(u=>u.me)+1;
  const _lbTotal = _lbPool.length;
  const earnedBadges = BADGE_DEFS.filter(b=>state.badges[b.id]);
  const avgForm = state.formScores.length? Math.round(state.formScores.reduce((a,b)=>a+b,0)/state.formScores.length) : 0;
  // Is this a brand-new user with zero activity?
  const isNew = state.workoutsCompleted===0 && state.xp===0;

  el('view-dashboard').innerHTML = `
    <div class="pagehead">
      <div><h1 class="display">Dashboard</h1><p>Here's where your quest stands today.</p></div>
    </div>
    <div class="dash-grid">
      <div class="card span3">
        ${renderReadinessCard()}
      </div>

      <div class="hero-card span2">
        <div class="hero-split">
        <div class="hero-main">
        <div class="hero-greet">${isNew ? 'Welcome to FitQuest,' : 'Good to see you,'}</div>
        <div class="hero-name">${esc(state.currentUser.name)} 👋</div>
        <div class="hero-msg">${isNew ? 'Your fitness journey starts now. Complete your first workout to earn XP!' : pick(MOTIVATION)}</div>
        <div class="hero-stats">
          <div class="hero-stat"><b>${lvl+1}</b><span>${LEVELS[lvl]}</span></div>
          <div class="hero-stat"><b>${state.xp}</b><span>Total XP</span></div>
          <div class="hero-stat"><b>${state.streak}🔥</b><span>Day Streak</span></div>
        </div>
        <div style="margin-top:16px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);"><span>Level Progress</span><span>${pct}%</span></div>
          <div class="xp-bar-outer"><div class="xp-bar-inner" style="width:${pct}%"></div></div>
        </div>
        ${isNew?`<div style="margin-top:14px;"><button class="btn btn-volt btn-sm" onclick="setView('coach')">🎥 Start Your First Workout</button></div>`:''}
        </div>
        <div class="hero-side">
          <div class="hero-mini">
            <div class="card-title">Daily Water</div>
            <div class="hero-mini-water">${renderWaterHeading()}</div>
          </div>
          <div class="hero-mini">
            <div class="card-title">👟 Step Tracker</div>
            <div class="steps-today"><span id="steps-count-live">${steps.count.toLocaleString()}</span> <span class="unit">/ ${STEP_GOAL.toLocaleString()} steps</span></div>
            <div class="xp-bar-outer"><div class="xp-bar-inner" id="steps-bar-inner" style="width:${stepsPct}%"></div></div>
            <div class="small-muted" style="margin-top:8px;">📍 <span id="steps-distance-live">${stepsToDistanceKm(steps.count).toFixed(2)} km</span> walked/run today</div>
            ${stepTrackingActive
              ? `<div class="small-muted" style="margin-top:8px;">🟢 Auto-tracking — just keep this tab open while you move.</div>`
              : stepPermissionNeeded
                ? `<button class="btn btn-volt btn-sm mt" onclick="enableStepTrackingTap()">Enable Step Tracking</button>`
                : `<div class="small-muted" style="margin-top:8px;">Motion sensors aren't available on this device/browser.</div>`}
          </div>
        </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Weekly Streak</div>
        <div class="streak-row">
          ${weekStreakCells()}
        </div>
        <div class="small-muted" style="margin-top:10px;">✓ logged in · ✗ missed · ○ upcoming</div>
        ${isNew?`<div class="small-muted" style="margin-top:6px;">Log in daily to grow your streak!</div>`:''}
      </div>

      <div class="dash-side">
      <div class="card lb-mini">
        <div class="card-title">Leaderboard Position</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="num display lb-rank-num">#${myRank}</div>
          <div class="small-muted">Out of ${_lbTotal} athlete${_lbTotal!==1?'s':''} this week</div>
        </div>
        <button class="btn btn-ghost btn-sm btn-block" style="margin-top:10px;" onclick="setView('leaderboard')">View leaderboard</button>
      </div>

      <div class="stat-tile"><div class="num accent">${state.workoutsCompleted}</div><div class="lbl">Total Workouts</div></div>
      <div class="stat-tile"><div class="num accent">${state.totalReps}</div><div class="lbl">Total Reps</div></div>
      </div>
      <div class="stat-tile"><div class="num accent">${state.totalCalories}</div><div class="lbl">Calories Burned (est.)</div></div>
      <div class="stat-tile"><div class="num accent">${avgForm||'—'}%</div><div class="lbl">Correct-Form Avg</div></div>

      <div class="card span2">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <span>Today's Suggested Workout${suggestion.exercises.length ? ` · ${esc(suggestion.focus)}` : ''}</span>
          ${suggestion.readinessScore<=-2 ? `<span class="readiness-tag down">Recovery mode</span>` : suggestion.readinessScore>=2 ? `<span class="readiness-tag up">Volume up</span>` : ''}
        </div>
        ${suggestion.exercises.length ? suggestion.exercises.map(e=>`
          <div class="workout-mini"><span>${e.icon} ${esc(e.name)}</span><span class="small-muted">${e.reps}</span></div>
        `).join('') : `
          <p class="small-muted" style="margin:4px 0 2px;">Rest &amp; recovery day for your ${esc(p.goal||'fitness')} goal — light stretching or a walk works well today.</p>
        `}
        <button class="btn btn-volt btn-sm mt" onclick="setView('coach')">Start AI Coach →</button>
      </div>

      <div class="card">
        <div class="card-title">Challenges</div>
        ${state.challenges.map(c=>`
          <div class="workout-mini" onclick="setView('challenges')" style="cursor:pointer;" title="Open challenges">
            <span>${c.icon} ${esc(c.name)}</span>
            <span class="small-muted">${c.progress}/${c.target} ${c.unit}</span>
          </div>
          <div class="chal-prog-outer" style="margin:-2px 0 8px;"><div class="chal-prog-inner" style="width:${Math.min(100,Math.round(c.progress/c.target*100))}%"></div></div>
        `).join('')}
        <button class="btn btn-ghost btn-sm btn-block" onclick="setView('challenges')">View all challenges</button>
      </div>

      <div class="card">
        <div class="card-title">🎡 Daily Spin Wheel</div>
        <div class="spin-wheel-wrap">
          <div class="spin-wheel-outer">
            <div class="spin-pointer"></div>
            <div class="spin-wheel-disc" id="spin-wheel-disc" style="background:conic-gradient(${SPIN_SEGMENTS.map((_,i)=>`${SPIN_COLORS[i%SPIN_COLORS.length]} ${i*45}deg ${(i+1)*45}deg`).join(', ')});">
              ${SPIN_SEGMENTS.map((val,i)=>`<div class="spin-seg-label" style="transform:rotate(${i*45+22.5}deg);"><span style="transform:translate(-50%,-64px) rotate(${-(i*45+22.5)}deg);">${val}</span></div>`).join('')}
            </div>
            <div class="spin-hub">🪙</div>
          </div>
          <button class="btn btn-volt btn-sm" id="spin-wheel-btn" onclick="spinWheel()" ${canSpinToday()?'':'disabled'}>${canSpinToday()?'SPIN to win XP!':'Come back tomorrow'}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⌚ Connected Device</div>
        ${hrConnected() ? `
          <div class="steps-today"><span id="ls-hr-dash">${currentHr||'—'}</span> <span class="unit">BPM</span></div>
          <div class="small-muted" id="hr-connect-status">🟢 ${esc(hrDevice.name||'Device')} connected</div>
          <div class="small-muted" style="margin-top:8px;">Live heart rate streams into AI Coach, and calories are calculated from your real heart rate.</div>
          <button class="btn btn-ghost btn-sm mt" onclick="disconnectHeartRateDevice()">Disconnect</button>
        ` : `
          <p class="small-muted" style="margin:6px 0 12px;">Pair a smartwatch, band, or heart-rate strap over Bluetooth for live heart rate and HR-based calorie tracking.</p>
          <button class="btn btn-volt btn-sm" onclick="connectHeartRateDevice()">⌚ Connect Device</button>
          <p class="small-muted" style="margin-top:10px;font-size:11px;line-height:1.55;">
            ${bluetoothSupported()
              ? `Works with Wear OS, Polar, Amazfit, Coros, Garmin &amp; chest straps. <b>Apple Watch and Fitbit aren't supported</b> — they don't expose heart rate to third-party apps.`
              : `⚠️ This browser doesn't support Web Bluetooth. Use Chrome or Edge on Android, Windows, macOS or Linux.`}
          </p>
        `}
      </div>

      <div class="card span3">
        <div class="card-title">Recent Achievements</div>
        <div class="badge-row">
          ${earnedBadges.length? earnedBadges.map(b=>`<div class="badge-pill">${b.icon} ${b.name}</div>`).join('') : '<span class="small-muted">Complete workouts to unlock badges.</span>'}
        </div>
      </div>

      <div class="card span3 premium-card">
        <div class="premium-card-head">
          <div class="card-title" style="margin:0;">✨ Premium — AI Workout &amp; Diet Plans</div>
          ${state.premium ? '<span class="premium-badge">PREMIUM</span>' : ''}
        </div>
        ${!state.premium ? `
          <p class="small-muted" style="margin:6px 0 14px;">Unlock a full 7-day plan generated from your goal, level, and recent form — workouts and meals, tailored automatically.</p>
          <button class="btn btn-volt btn-sm" onclick="setView('paywall')">🔓 Unlock Premium</button>
        ` : !state.premiumPlan ? `
          <p class="small-muted" style="margin:6px 0 14px;">You're set. Generate your first personalized plan based on your ${esc(p.goal||'fitness')} goal and ${esc(p.level||'Beginner')} level.</p>
          <button class="btn btn-volt btn-sm" onclick="generatePremiumPlan();setView('premium');">🤖 Generate My AI Plan</button>
        ` : `
          <p class="small-muted" style="margin:6px 0 10px;">Plan built for <b>${esc(state.premiumPlan.goal)}</b> · ${esc(state.premiumPlan.level)} level · ${state.premiumPlan.dietTotals.kcal} kcal/day target.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-volt btn-sm" onclick="setView('premium')">📋 View Full Plan</button>
            <button class="btn btn-ghost btn-sm" onclick="setView('assistant')">💬 Ask AI Assistant</button>
            <button class="btn btn-ghost btn-sm" onclick="setView('trainer')">🎯 Personal Trainer</button>
            <button class="btn btn-ghost btn-sm" onclick="generatePremiumPlan();renderDashboard();toast('<b>Plan refreshed</b><br>Regenerated from your latest activity.');">🔄 Regenerate</button>
          </div>
        `}
      </div>
    </div>`;
}

/* ================= EXERCISE LIBRARY ================= */
let libFilter='All', libSearch='';
function filteredExercises(){
  return EXERCISES.filter(e=>{
    const matchF = libFilter==='All' || e.difficulty===libFilter || e.category.includes(libFilter);
    const matchS = (e.name+' '+(e.hing||'')+' '+(e.hi||'')).toLowerCase().includes(libSearch.toLowerCase());
    return matchF && matchS;
  });
}
function exCardHTML(e){
  return `
        <div class="ex-card">
          <div class="ex-thumb">${e.icon}</div>
          <div class="ex-body">
            <div class="ex-name">${e.name}</div>${e.hi?`<div class="small-muted" style="margin-bottom:4px;">${e.hi} · ${e.hing}</div>`:''}
            <div class="ex-tags"><span class="tag diff-${e.difficulty}">${e.difficulty}</span>${e.category.map(c=>`<span class="tag">${c}</span>`).join('')}</div>
            <div class="ex-meta">${e.muscles.join(', ')}</div>
            <div class="ex-meta">${e.reps}${isHoldEx(e)?'s hold':' reps'} · ~${Math.round((e.kcalPerRep||0.05)*e.reps*10)/10} kcal</div>
            <div class="small-muted">${e.desc}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-volt btn-sm mt" onclick="openCoachWith('${e.id}')">Start AI ▶</button><button class="btn btn-ghost btn-sm mt" onclick="openExerciseGuide('${e.id}')">📖 Guide</button></div>
          </div>
        </div>`;
}
function setLibFilter(f){ libFilter=f; renderLibrary(); }
function onLibSearchInput(v){ libSearch=v; updateLibGrid(); }
function updateLibGrid(){
  const grid = el('ex-grid');
  if(!grid) return;
  const list = filteredExercises();
  grid.innerHTML = list.length ? list.map(exCardHTML).join('') : '<div class="small-muted">No exercises match your search.</div>';
  // keep active chip state in sync without full re-render
  document.querySelectorAll('#view-library .filter-chip').forEach(ch=>{
    ch.classList.toggle('on', ch.textContent===libFilter);
  });
}
function renderLibrary(){
  const filters=['All','Beginner','Intermediate','Advanced','Upper Body','Lower Body','Full Body','Cardio','Strength','Core','Yoga'];
  const list = filteredExercises();
  el('view-library').innerHTML = `
    <div class="pagehead">
      <div><h1 class="display">Exercise Library</h1><p>${EXERCISES.length} AI-tracked exercises with real-time form analysis.</p></div>
      <input class="search-box" id="lib-search" placeholder="Search exercises..." value="${esc(libSearch)}" oninput="onLibSearchInput(this.value)">
    </div>
    <div class="ex-filterbar">${filters.map(f=>`<button class="filter-chip ${f===libFilter?'on':''}" onclick="setLibFilter('${f}')">${f}</button>`).join('')}</div>
    <div class="ex-grid" id="ex-grid">
      ${list.map(exCardHTML).join('')}
    </div>`;
  // restore focus + cursor at end after full re-render (filter clicks)
  const inp = el('lib-search');
  if(inp && document.activeElement !== inp){ /* keep focus only if user was typing — handled by partial updates */ }
}
function openCoachWith(id){
  state.coach.selectedExercise = id;
  setView('coach');
}

/* ================= YOGA NAMES + SHARED HELPERS ================= */
// Yoga poses carry their name in Hindi (hi), Hinglish (hing = Hindi in English letters) and English (name).
function isHoldEx(e){ return !!e && (e.engine==='hold' || String(e.engine).indexOf('yoga')===0); }
function yogaNamesHTML(e){
  if(!e.hi) return `<div class="ex-name">${e.name}</div>`;
  return `<div class="yoga-names">
    <div class="yn-row"><span class="yn-lbl">हिंदी</span><span class="yn-hi">${e.hi}</span></div>
    <div class="yn-row"><span class="yn-lbl">Hinglish</span><span class="yn-hing">${e.hing}</span></div>
    <div class="yn-row"><span class="yn-lbl">English</span><span class="yn-en">${e.name}</span></div>
  </div>`;
}
function yogaNameLine(e){ return e && e.hi ? `<div class="yn-line">${e.hi} · ${e.hing} · ${e.name}</div>` : ''; }
function yogaList(arr){ return arr.filter(v=>v!==null && v!==undefined); }
function yogaAvg(arr){ const a=yogaList(arr); return a.length ? a.reduce((x,y)=>x+y,0)/a.length : null; }
function yogaMin(arr){ const a=yogaList(arr); return a.length ? Math.min(...a) : null; }
function yogaMax(arr){ const a=yogaList(arr); return a.length ? Math.max(...a) : null; }
// Sideways lean of the torso from vertical, in degrees (front-on camera).
function yogaTorsoTilt(lms){
  const lsh=lms[LM.LSH], rsh=lms[LM.RSH], lh=lms[LM.LHIP], rh=lms[LM.RHIP];
  if(!lsh||!rsh||!lh||!rh) return 0;
  const sx=(lsh.x+rsh.x)/2, sy=(lsh.y+rsh.y)/2, hx=(lh.x+rh.x)/2, hy=(lh.y+rh.y)/2;
  return Math.abs(Math.atan2(sx-hx, hy-sy)*180/Math.PI);
}
// One frame of a hold-type pose: counts hold time while the form is right.
function yogaTick(ex, ok, msgOk, msgFix, lms){
  const c = state.coach;
  if(ok){ c.holdSeconds += 1/30; setFeedback(msgOk,'hi'); }
  else setFeedback(msgFix,'med');
  updateFormScore(ex, ok?170:100, lms);
  const rc=el('rep-count'); if(rc) rc.textContent=formatTime(c.holdSeconds);
  if(c.holdSeconds>=ex.reps){ completeSet(ex); c.holdSeconds=0; }
}

/* ================= YOGA AI ================= */
const YOGA_POSE_IDS = EXERCISES.filter(e=>e.category.includes('Yoga')).map(e=>e.id);
function renderYoga(){
  const poses = EXERCISES.filter(e=>YOGA_POSE_IDS.includes(e.id));
  el('view-yoga').innerHTML = `
    <div class="pagehead">
      <div><h1 class="display">🧘 Yoga AI</h1><p>${poses.length} AI-guided standing yoga poses — named in Hindi, Hinglish and English — with real-time alignment feedback.</p></div>
    </div>
    <div class="card" style="margin-bottom:18px;">
      <p class="small-muted" style="line-height:1.6;">
        Each pose uses the same on-device pose-tracking as AI Coach, with alignment checks built specifically for that pose's shape — not a generic timer.
        Works best standing a few steps back so your whole body is in frame. For now this covers standing poses only; floor poses (like Cobra or Child's Pose)
        aren't reliably trackable from a typical laptop or phone camera angle.
      </p>
    </div>
    <div class="ex-grid">
      ${poses.map(e=>`
        <div class="ex-card">
          <div class="ex-thumb">${e.icon}</div>
          <div class="ex-body">
            ${yogaNamesHTML(e)}
            <div class="ex-tags"><span class="tag diff-${e.difficulty}">${e.difficulty}</span>${e.category.map(c=>`<span class="tag">${c}</span>`).join('')}</div>
            <div class="ex-meta">${e.muscles.join(', ')}</div>
            <div class="ex-meta">${e.reps}s hold</div>
            <div class="small-muted">${e.desc}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-volt btn-sm mt" onclick="openCoachWith('${e.id}')">Start AI ▶</button><button class="btn btn-ghost btn-sm mt" onclick="openExerciseGuide('${e.id}')">📖 Guide</button></div>
          </div>
        </div>`).join('')}
    </div>`;
}

/* ================= EXERCISE GUIDE (AI Coach mini-form) ================= */
// A small, rule-based guide for anyone new to an exercise (or wanting a
// refresher). It is not a live camera check — for that it hands off to the
// AI Coach tracker. To add a demo video for an exercise, put its URL in GUIDE_VIDEOS.
const GUIDE_VIDEOS = {
  squat:          { src: () => window.SQUAT_DEMO_SRC },              // portrait clip
  pushup:         { src: () => window.GUIDE_CLIPS.pushup, wide:true },
  jumping_jack:   { src: () => window.GUIDE_CLIPS.jumping_jack, wide:true },
  lunge:          { src: () => window.GUIDE_CLIPS.lunge, wide:true },
  plank:          { src: () => window.GUIDE_CLIPS.plank, wide:true },
  situp:          { src: () => window.GUIDE_CLIPS.situp, wide:true },
  high_knees:     { src: () => window.GUIDE_CLIPS.high_knees, wide:true },
  bicep_curl:     { src: () => window.GUIDE_CLIPS.bicep_curl, wide:true },
  shoulder_press: { src: () => window.GUIDE_CLIPS.shoulder_press, wide:true },
  glute_bridge:   { src: () => window.GUIDE_CLIPS.glute_bridge, wide:true }
};
const GUIDE_DATA = {
  squat:{
    cues:[
      ['Set your stance','Stand with your feet about shoulder-width apart and toes turned out slightly. Weight in the middle of your feet.'],
      ['Brace and reach forward','Lift your chest tall, tighten your belly like you are about to be nudged, and stretch both arms straight out in front for balance.'],
      ['Hips back, then down','Start by pushing your hips back, as if sitting into a chair behind you. Bend your knees and lower slowly.'],
      ['Find your depth','Lower until your thighs are about parallel to the floor, or as low as you can go comfortably. Keep your heels flat and your knees in line with your toes.'],
      ['Drive up and breathe','Press through your whole foot to stand up, squeezing your glutes at the top. Breathe in on the way down, out on the way up.']],
    worries:{
      balance:['Losing balance',['Hold a wall or sturdy chair with one hand until you feel steady.','Keep your arms out in front — they act as a counterweight.','Pick a spot on the wall at eye level and keep looking at it.']],
      knees:['Knee discomfort',['Only go as low as feels comfortable — a half squat is a fine start.','Push your knees out in line with your toes; do not let them cave inward.','Stop if you feel sharp pain. If discomfort keeps coming back, check with a doctor or physio.']],
      depth:["Can't go low",['Widen your stance a little and turn your toes out more.','If your heels lift, put a small book or plate under them for now.','Go only as low as you can control — depth improves with practice.']],
      lean:['Leaning forward',['Keep your chest up and your eyes looking forward, not down.','Hold your hands together at your chest to help you stay upright.','Think "hips back" first, so your weight stays over your mid-foot.']]},
    plan:{never:'Start with <b>chair squats</b>: sit back until you lightly touch a chair, then stand. Do <b>2 sets of 5–6 reps</b> with 60 seconds rest.',few:'Try <b>2–3 sets of 8 bodyweight squats</b> with 45–60 seconds rest, focusing on smooth, even reps.',comfy:'Go for <b>3 sets of 10–12 reps</b> and let the AI camera check your depth and form.'}},
  pushup:{
    cues:[
      ['Hand position','Place your hands on the floor slightly wider than your shoulders, directly under them, fingers spread.'],
      ['Make a straight line','Extend your legs back on your toes. Squeeze your glutes and brace your core so your body is one straight line from head to heels.'],
      ['Lower with control','Bend your elbows and lower your chest toward the floor, elbows about 45° from your body, not flared out wide.'],
      ['Find your depth','Go down until your chest is about a fist from the floor, keeping your neck in line with your spine.'],
      ['Press away','Push the floor away until your arms are straight, without letting your hips sag. Breathe in going down, out pushing up.']],
    worries:{
      weak:['Not strong enough yet',['Do the push-up with your hands on a wall, counter or sturdy bench — the higher the surface, the easier it is.','Or keep your knees on the floor but hold the straight line from knees to head.','Lower slowly for 3 seconds — slow negatives build strength fast.']],
      wrists:['Wrist discomfort',['Spread your fingers and press through the whole palm.','Try push-ups on your fists or on push-up handles so your wrists stay straight.']],
      sag:['Hips sagging',['Squeeze your glutes and pull your belly button toward your spine.','If the line breaks, stop the set — a few good reps beat many sloppy ones.']],
      shoulders:['Shoulder discomfort',['Tuck your elbows to about 45° instead of flaring them out.','Use a smaller range of motion or a raised surface. Stop if you feel sharp pain.']]},
    plan:{never:'Start with <b>2 sets of 5 incline push-ups</b> (hands on a bench or counter), resting 60 seconds.',few:'Try <b>3 sets of 6–8 reps</b>, using knees or an incline when your form starts to slip.',comfy:'Go for <b>3 sets of 10–12 reps</b> with a 2-second lowering phase.'}},
  jumping_jack:{
    cues:[
      ['Start tall','Stand with your feet together and your arms by your sides, chest up and shoulders relaxed.'],
      ['Jump and open','Hop your feet out wider than your shoulders while your arms sweep out and up overhead.'],
      ['Land softly','Land on the balls of your feet with soft, slightly bent knees — quiet landings protect your joints.'],
      ['Jump back in','Hop your feet together while your arms come back down to your sides.'],
      ['Find your rhythm','Keep a steady, easy pace and breathe evenly. Speed up only when the movement feels smooth.']],
    worries:{
      impact:['Impact on my joints',['Try step-jacks: step one foot out at a time while raising your arms — no jumping.','Land softly on the balls of your feet with soft knees.']],
      coord:['Coordination',['Practice the legs alone first, then add the arms.','Go slowly at first — rhythm comes before speed.']],
      breath:['Getting out of breath',['Work for 20 seconds, then rest for 20–30 seconds.','Breathe in through your nose and out through your mouth in a steady pattern.']],
      noise:['Loud landings',['Bend your knees on landing and stay on the balls of your feet.','Take smaller jumps — you do not need big height.']]},
    plan:{never:'Start with <b>3 rounds of 20 seconds</b> of step-jacks, resting 30 seconds between rounds.',few:'Try <b>3 sets of 15–20 reps</b> with 30 seconds rest.',comfy:'Go for <b>3 sets of 30 reps</b> or 45 seconds continuous, with short rests.'}},
  lunge:{
    cues:[
      ['Stand tall','Feet hip-width apart, hands on your hips, chest up, and your core lightly braced.'],
      ['Step forward','Take a long step forward — long enough that your front shin can stay upright when you lower.'],
      ['Lower straight down','Bend both knees and drop your back knee toward the floor. Aim for about 90° in both knees.'],
      ['Check your alignment','Your front knee stays above your ankle, in line with your toes. Keep your torso upright.'],
      ['Push back up','Press through your front heel to return to standing, then repeat on the other leg.']],
    worries:{
      balance:['Losing balance',['Hold a wall or chair with one hand at first.','Take a slightly wider stance (like standing on train tracks, not a tightrope).','Try a reverse lunge — stepping backward is often steadier.']],
      knees:['Knee discomfort',['Keep your front knee above your ankle, not far past your toes.','Use a shorter range — lower only as far as it feels comfortable.','Stop if you feel sharp pain. If discomfort keeps coming back, check with a doctor or physio.']],
      lean:['Leaning forward',['Keep your eyes forward and your chest tall.','Think "straight down" instead of "forward".']],
      stride:['Not sure how far to step',['If your front heel lifts, your step is too short. If you feel stretched and unstable, it is too long.','Aim for both knees to reach roughly 90° at the bottom.']]},
    plan:{never:'Start with <b>2 sets of 5 reps per leg</b> holding a wall or chair, resting 60 seconds.',few:'Try <b>2–3 sets of 8 reps per leg</b>, slow and controlled.',comfy:'Go for <b>3 sets of 10 reps per leg</b>.'}},
  plank:{
    cues:[
      ['Set your elbows','Get on the floor and place your forearms down with elbows directly under your shoulders.'],
      ['Extend your legs','Step your feet back onto your toes, legs straight and about hip-width apart.'],
      ['Make a straight line','Squeeze your glutes and brace your core so your body forms a straight line from shoulders to ankles.'],
      ['Neck and eyes','Look at the floor just ahead of your hands so your neck stays in line with your spine.'],
      ['Hold and breathe','Breathe steadily — do not hold your breath. End the set when your hips start to sag.']],
    worries:{
      sag:['Hips sagging or lower back pinching',['Squeeze your glutes and tuck your tailbone slightly.','Shorten the hold — a perfect 15 seconds beats a sagging 45.']],
      shoulders:['Shoulders getting tired',['Push the floor away so your shoulder blades stay wide.','Rest on your knees for a moment, then continue.']],
      shake:['Shaking',['A little shaking is normal — it means your muscles are working.','Go for shorter holds, or place your knees on the floor.']],
      breath:['Holding my breath',['Breathe in for 3 counts, out for 3 counts throughout the hold.']]},
    plan:{never:'Start with <b>3 holds of 10–15 seconds</b> (knees down if needed), resting 30 seconds.',few:'Try <b>3 holds of 20–30 seconds</b> with good form.',comfy:'Go for <b>3 holds of 30–45 seconds</b>.'}},
  situp:{
    cues:[
      ['Lie down','Lie on your back with your knees bent and your feet flat on the floor, hip-width apart.'],
      ['Hand position','Cross your arms over your chest, or lightly touch your fingertips to your temples. Do not pull on your neck.'],
      ['Curl up','Breathe out and curl your chest up, rolling one section of your spine off the floor at a time.'],
      ['Sit up tall','Come up until your torso is upright, keeping your feet planted.'],
      ['Lower slowly','Breathe in and roll back down with control — do not just drop.']],
    worries:{
      neck:['Neck strain',['Cross your arms over your chest instead of pulling on your head.','Keep a small gap between your chin and chest, and look toward your knees.']],
      feet:['My feet lift up',['Tuck your feet under a sofa or have someone hold them.','Slow down — momentum makes feet lift.']],
      back:['Lower back discomfort',['Do smaller crunches — lift only your shoulder blades off the floor.','Place a folded towel under your lower back for comfort.']],
      weak:["Can't come all the way up",['Do crunches first — lift only your head and shoulders.','Lower slowly from the top; slow lowering builds the strength to come up.']]},
    plan:{never:'Start with <b>2 sets of 5–8 crunches</b> (shoulder blades only), resting 45 seconds.',few:'Try <b>3 sets of 8–10 sit-ups</b>, slow and controlled.',comfy:'Go for <b>3 sets of 12–15 sit-ups</b>.'}},
  high_knees:{
    cues:[
      ['Stand tall','Feet hip-width apart, chest up, and arms bent at your sides.'],
      ['Drive a knee up','Lift one knee toward hip height while the opposite arm swings forward.'],
      ['Switch quickly','Lower that foot and drive the other knee up, as if running in place.'],
      ['Stay tall and light','Keep your chest lifted and land on the balls of your feet — quick, light steps.'],
      ['Breathe and pace','Breathe evenly and keep a steady pace. Height first, speed second.']],
    worries:{
      impact:['Impact on my joints',['Do the march version: lift your knees high but keep one foot on the floor at all times.','Land softly on the balls of your feet.']],
      height:["Knees won't get high",['Slow down and lift each knee to hip height on purpose.','Use your arms — swing them like a sprinter.']],
      lean:['Leaning back',['Lift your chest and lean very slightly forward from the ankles.','Think about pulling your knee up instead of leaning back.']],
      breath:['Getting out of breath',['Work for 20 seconds, then rest for 20–30 seconds.','Keep your breathing rhythm steady, not held.']]},
    plan:{never:'Start with <b>3 rounds of 20 seconds</b> of high-knee marching, resting 30 seconds.',few:'Try <b>3 rounds of 20–30 seconds</b> at a steady pace.',comfy:'Go for <b>3 rounds of 30–45 seconds</b> with 20 seconds rest.'}},
  bicep_curl:{
    cues:[
      ['Grab your weights','Stand tall with your feet hip-width apart, holding dumbbells (or water bottles) at your sides with palms facing forward.'],
      ['Pin your elbows','Keep your elbows next to your ribs and your shoulders relaxed and down.'],
      ['Curl up','Bend only at the elbows and curl the weights toward your shoulders.'],
      ['Squeeze at the top','Pause for a second and squeeze your biceps. Your upper arms should stay still.'],
      ['Lower slowly','Take 2–3 seconds to lower to straight arms. Breathe out on the way up, in on the way down.']],
    worries:{
      swing:['Swinging my body',['Use a lighter weight until you can curl without leaning back.','Stand with your back near a wall to stop yourself swinging.']],
      elbows:['Elbows drifting forward',['Imagine a strap holding your elbows against your ribs.','Slow down — control matters more than weight.']],
      wrist:['Wrist discomfort',['Keep your wrists straight, in line with your forearms.','Try a lighter weight or a resistance band.']],
      noweights:['I have no weights',['Use water bottles, a filled backpack, or a resistance band.','Use whatever lets you finish the set with controlled reps.']]},
    plan:{never:'Start with <b>2 sets of 8 reps</b> with a light weight, resting 45 seconds.',few:'Try <b>3 sets of 10 reps</b> at a slow tempo.',comfy:'Go for <b>3 sets of 12 reps</b>, increasing weight when the last reps feel easy.'}},
  shoulder_press:{
    cues:[
      ['Set your stance','Stand with your feet hip-width apart, glutes squeezed and core braced.'],
      ['Start position','Hold the weights at shoulder height with your elbows under your wrists and palms facing forward.'],
      ['Press overhead','Press straight up until your arms are extended above your shoulders, without arching your lower back.'],
      ['Head through','At the top, your biceps should be near your ears and your ribs pulled down.'],
      ['Lower under control','Bring the weights back to shoulder height slowly. Breathe out as you press, in as you lower.']],
    worries:{
      back:['Arching my lower back',['Squeeze your glutes and keep your ribs pulled down.','Try the seated version with your back supported.']],
      shoulders:['Shoulder pinching',['Use a lighter weight and a smaller range.','Press slightly in front of you rather than straight out to the sides.','Stop if you feel sharp pain and check with a physio if it repeats.']],
      heavy:['Weights feel too heavy',['Use water bottles or lighter dumbbells.','Do fewer reps with perfect form.']],
      balance:['Losing balance',['Stand with your feet slightly wider or do the exercise seated.','Keep your eyes on a fixed point.']]},
    plan:{never:'Start with <b>2 sets of 8 reps</b> with very light weights, resting 60 seconds.',few:'Try <b>3 sets of 8–10 reps</b> at a controlled tempo.',comfy:'Go for <b>3 sets of 10–12 reps</b>.'}},
  glute_bridge:{
    cues:[
      ['Lie down','Lie on your back with your knees bent, feet flat on the floor, hip-width apart, heels close to your glutes.'],
      ['Arms and core','Rest your arms by your sides and gently brace your core.'],
      ['Lift your hips','Press through your heels and lift your hips toward the ceiling.'],
      ['Squeeze at the top','Make a straight line from shoulders to knees and squeeze your glutes for a second — do not arch your back.'],
      ['Lower slowly','Roll your hips back down with control. Breathe out on the way up.']],
    worries:{
      back:['Feeling it in my lower back',['Pull your ribs down and tuck your pelvis slightly.','Lift only until your body is straight — do not push higher.']],
      hamstring:['Hamstring cramps',['Move your feet closer to your glutes.','Press through your heels rather than your toes.']],
      feel:["Can't feel my glutes",['Squeeze your glutes before you lift.','Pause for 2 seconds at the top of each rep.']],
      knees:['Knees drifting in',['Keep your knees in line with your hips and toes.','Press gently outward through your feet.']]},
    plan:{never:'Start with <b>2 sets of 8 reps</b> with a 2-second squeeze, resting 45 seconds.',few:'Try <b>3 sets of 12 reps</b>.',comfy:'Go for <b>3 sets of 15 reps</b>, or try single-leg bridges.'}},
  calf_raise:{
    cues:[
      ['Set up','Stand tall near a wall or chair for support, feet hip-width apart.'],
      ['Brace','Keep your core lightly braced and your knees soft, not locked.'],
      ['Rise up','Slowly rise onto the balls of your feet as high as you can.'],
      ['Pause at the top','Hold for 1–2 seconds and squeeze your calves.'],
      ['Lower slowly','Take about 3 seconds to lower your heels back down.']],
    worries:{
      balance:['Losing balance',['Hold a wall or chair lightly with your fingertips.','Look at a fixed point in front of you.']],
      ankles:['Ankles rolling outward',['Press through the base of your big toe.','Keep your weight over the middle of your feet.']],
      range:['Small range of motion',['Stand on the edge of a step so your heels can drop below the step.','Go slowly — the pause at the top makes it harder.']],
      cramp:['Calf cramps',['Slow down and reduce your range a little.','Stretch your calves gently between sets.']]},
    plan:{never:'Start with <b>2 sets of 10 reps</b> holding a wall, resting 45 seconds.',few:'Try <b>3 sets of 15 reps</b> with a 1-second pause at the top.',comfy:'Go for <b>3 sets of 20 reps</b>, or try single-leg raises.'}},
  mountain_climber:{
    cues:[
      ['High plank','Place your hands under your shoulders and extend your legs back on your toes, body in a straight line.'],
      ['Brace','Squeeze your glutes and pull your belly button toward your spine.'],
      ['Drive a knee','Bring one knee toward your chest without letting your hips rise.'],
      ['Switch legs','Swap legs in a running motion, keeping your hips low and steady.'],
      ['Breathe and pace','Keep a steady pace and breathe. Form first, speed second.']],
    worries:{
      hips:['Hips bouncing up',['Slow down and keep your hips level with your shoulders.','Squeeze your glutes throughout.']],
      wrists:['Wrist discomfort',['Spread your fingers and press through your whole palm.','Try the exercise with your hands on a bench or counter.']],
      pace:['Too fast to control',['Do slow-motion climbers: drive each knee up deliberately.','Focus on 10 quality reps per side.']],
      weak:['Not strong enough yet',['Place your hands on a bench or counter to make the move easier.','Do shorter sets and rest often.']]},
    plan:{never:'Start with <b>3 rounds of 15 seconds</b> of slow climbers (hands on a bench), resting 30 seconds.',few:'Try <b>3 rounds of 20 seconds</b> at a moderate pace.',comfy:'Go for <b>3 rounds of 30 seconds</b> with 30 seconds rest.'}},
  yoga_tree:{
    cues:[
      ['Stand tall','Feet together, weight even on both feet, shoulders relaxed.'],
      ['Pick a focus point','Choose a fixed spot at eye level and keep your gaze on it.'],
      ['Place your foot','Shift your weight onto one leg and place the sole of the other foot on your inner calf or thigh — never directly on the knee.'],
      ['Hands and hips','Bring your palms together at your chest. Keep your hips level and press your foot and leg gently into each other.'],
      ['Breathe and switch','Breathe slowly, optionally raise your arms overhead, then switch sides.']],
    worries:{
      wobble:['Wobbling',['Keep your toes of the lifted foot on the floor (like a kickstand) at first.','Rest your fingertips on a wall.']],
      knee:['Foot on my knee?',['Never press your foot against the side of your knee.','Place it low on the ankle or calf instead — that is a perfectly good tree.']],
      hip:['Hips tilting',['Keep your hip bones level, like a bowl of water you do not want to spill.','Lower your foot a little until your hips stay level.']],
      focus:["Can't stay focused",['Fix your gaze on one spot and slow your breathing.','Count 5 slow breaths per side.']]},
    plan:{never:'Start with <b>10–15 seconds per side</b> with fingertips on a wall, 2–3 rounds.',few:'Try <b>20 seconds per side</b>, 2–3 rounds.',comfy:'Go for <b>30–45 seconds per side</b> with arms overhead.'}},
  yoga_warrior2:{
    cues:[
      ['Wide stance','Step your feet about a leg-length apart. Turn your front foot forward and your back foot slightly in.'],
      ['Bend your front knee','Bend your front knee toward 90°, keeping it over your ankle and in line with your toes.'],
      ['Arms wide','Extend your arms to shoulder height, palms down, one over each leg.'],
      ['Gaze and posture','Look over your front hand. Keep your torso centered over your hips, not leaning forward.'],
      ['Hold, breathe, switch','Breathe steadily for the hold, then switch sides.']],
    worries:{
      knee:['Front knee falling inward',['Point your knee toward your second toe.','Shorten your stance or bend less until you can control it.']],
      thigh:['Thighs burning',['Bend less and hold for a shorter time.','Breathe slowly and stay relaxed in your shoulders.']],
      lean:['Leaning forward',['Stack your shoulders over your hips.','Imagine your head and tailbone are on a line.']],
      stance:['Stance feels off',['Front heel should line up with the arch of your back foot.','If you feel unstable, shorten your stance a bit.']]},
    plan:{never:'Start with <b>10–15 seconds per side</b>, 2 rounds, with a shallower knee bend.',few:'Try <b>20 seconds per side</b>, 2–3 rounds.',comfy:'Go for <b>30–45 seconds per side</b> with a deeper bend.'}},
  yoga_chair:{
    cues:[
      ['Stand tall','Feet together or hip-width apart, weight even.'],
      ['Sit back','Bend your knees and send your hips back as if sitting on a chair.'],
      ['Arms overhead','Raise your arms beside your ears, shoulders relaxed away from your ears.'],
      ['Weight in your heels','Keep your weight toward your heels and your chest lifted.'],
      ['Hold and breathe','Breathe slowly and steadily. Rise up slowly when you are done.']],
    worries:{
      knees:['Knees going past toes',['Send your hips further back before bending.','Keep your weight in your heels.']],
      back:['Arching my lower back',['Tuck your tailbone slightly and draw your belly in.','Bring your ribs down.']],
      shoulders:['Shoulders tiring',['Bring your palms together at your chest instead of overhead.','Relax your shoulders away from your ears.']],
      thighs:['Thighs burning',['Bend less and hold for a shorter time.','Rest and repeat — this pose builds endurance quickly.']]},
    plan:{never:'Start with <b>10 seconds</b> with a shallow bend and hands at your chest, 3 rounds.',few:'Try <b>15–20 seconds</b>, 3 rounds.',comfy:'Go for <b>30 seconds</b> with arms overhead, 3 rounds.'}},
  yoga_mountain:{
    cues:[
      ['Feet together','Stand with your big toes touching and heels slightly apart. Spread your toes and press evenly through your feet.'],
      ['Firm legs, tall spine','Lift your kneecaps gently, tuck your tailbone slightly and lift your chest.'],
      ['Shoulders and arms','Roll your shoulders back and down. Let your arms rest by your sides with palms facing forward.'],
      ['Head and gaze','Keep your chin level and look straight ahead. Imagine a string lifting the crown of your head.'],
      ['Breathe','Breathe slowly through your nose and stay steady. Feel your whole body standing tall.']],
    worries:{
      balance:['Feeling unsteady',['Stand with your feet hip-width apart instead of together.','Fix your eyes on one spot at eye level.']],
      back:['Lower back arching',['Tuck your tailbone slightly and draw your belly in.','Keep your ribs pulled down.']],
      shoulders:['Shoulders rounded',['Roll your shoulders back and down, then relax them.','Open your chest gently without pushing your ribs forward.']],
      knees:['Locking my knees',['Keep a tiny softness in your knees.','Press into your feet and lift your thighs gently.']]},
    plan:{never:'Hold for <b>15–20 seconds</b>, 3 rounds, with feet hip-width apart.',few:'Hold for <b>30 seconds</b>, 3 rounds, feet together.',comfy:'Hold for <b>45–60 seconds</b> while breathing slowly.'}},
  yoga_upward_salute:{
    cues:[
      ['Start in Mountain','Stand tall with feet together (or hip-width) and arms by your sides.'],
      ['Sweep arms up','Breathe in and sweep both arms out to the sides and up overhead.'],
      ['Palms face each other','Bring your palms to face each other or touch. Keep your shoulders relaxed, away from your ears.'],
      ['Lengthen up','Stretch up through your fingertips. Keep your ribs drawn in and your legs straight.'],
      ['Hold and release','Breathe steadily. When done, breathe out and lower your arms back to your sides.']],
    worries:{
      shoulders:['Tight shoulders',['Keep your arms shoulder-width apart instead of joining your palms.','Raise your arms only as high as is comfortable.']],
      back:['Lower back arching',['Tuck your tailbone slightly and draw your belly in.','Keep your ribs from flaring forward.']],
      balance:['Losing balance',['Take your feet hip-width apart.','Look at a fixed point in front of you.']],
      neck:['Neck strain',['Keep your gaze forward instead of looking up.','Relax your shoulders away from your ears.']]},
    plan:{never:'Hold for <b>10–15 seconds</b>, 3 rounds, arms shoulder-width apart.',few:'Hold for <b>20 seconds</b>, 3 rounds.',comfy:'Hold for <b>30–45 seconds</b> with palms joined.'}},
  yoga_warrior1:{
    cues:[
      ['Step back','From standing, step one foot back about 3–4 feet. Turn the back foot out about 45°, heel down.'],
      ['Bend the front knee','Bend your front knee toward 90°, keeping it over your ankle. Keep your back leg straight and strong.'],
      ['Square your hips','Turn your hips and chest to face forward as much as feels comfortable.'],
      ['Arms overhead','Sweep both arms overhead with palms facing each other. Keep your shoulders relaxed.'],
      ['Hold, breathe, switch','Breathe steadily for the hold. Then step back and repeat on the other side.']],
    worries:{
      knee:['Knee discomfort',['Keep your front knee above your ankle, not past your toes.','Bend less and shorten your stance.']],
      balance:['Losing balance',['Widen your stance side to side (like train tracks).','Keep your hands on your hips at first.']],
      hips:["Hips won't square",['Let your back heel lift slightly if needed.','Turn as far as is comfortable — it improves with practice.']],
      back:['Lower back arching',['Tuck your tailbone slightly and draw your belly in.','Keep your ribs drawn in as your arms rise.']]},
    plan:{never:'Hold for <b>10–15 seconds per side</b> with hands on your hips, 2 rounds.',few:'Hold for <b>20 seconds per side</b>, 2–3 rounds.',comfy:'Hold for <b>30–45 seconds per side</b> with arms overhead.'}},
  yoga_goddess:{
    cues:[
      ['Wide stance','Step your feet about 3–4 feet apart and turn your toes out about 45°.'],
      ['Bend your knees','Bend your knees over your toes and sink your hips toward knee height.'],
      ['Tall torso','Keep your spine tall with your tailbone tucked down. Do not lean forward.'],
      ['Cactus arms','Raise your arms to shoulder height with elbows bent at 90° and palms facing forward.'],
      ['Hold and breathe','Breathe steadily. Press your feet down to stand up when finished.']],
    worries:{
      knees:['Knees caving in',['Push your knees out in line with your toes.','Turn your toes out a little more.']],
      thighs:['Thighs burning',['Bend less — a shallower squat is fine.','Rest for a moment between short holds.']],
      back:['Leaning forward',['Lift your chest and tuck your tailbone.','Imagine your back against a wall.']],
      arms:['Arms getting tired',['Bring your hands together at your chest in prayer position.','Lower your elbows a little.']]},
    plan:{never:'Hold for <b>10–15 seconds</b> with a shallow bend, 3 rounds.',few:'Hold for <b>20 seconds</b>, 3 rounds.',comfy:'Hold for <b>30–45 seconds</b> with a deeper bend.'}},
  yoga_triangle:{
    cues:[
      ['Wide stance','Step your feet about 3–4 feet apart. Turn your right foot out 90° and your left foot slightly in.'],
      ['Arms out','Raise both arms to shoulder height, palms down. Keep both legs straight.'],
      ['Hinge sideways','Reach forward over your right leg, then tilt your torso sideways from your hip — not by rounding at the waist.'],
      ['Stack your arms','Place your right hand on your shin, ankle or a block, and reach your left arm up toward the ceiling.'],
      ['Hold and switch','Breathe steadily. Then come up slowly and repeat on the other side.']],
    worries:{
      hamstrings:['Tight hamstrings',['Rest your lower hand on your thigh or shin instead of the floor.','Use a block or a sturdy chair for support.']],
      balance:['Losing balance',['Take a shorter stance.','Lean your back lightly against a wall.']],
      knee:['Locking my front knee',['Keep a tiny bend in your front knee.','Press your foot into the floor to stay engaged.']],
      neck:['Neck strain',['Look straight ahead or down instead of up.','Relax your shoulders away from your ears.']]},
    plan:{never:'Hold for <b>10 seconds per side</b> with a hand on your thigh, 2 rounds.',few:'Hold for <b>15–20 seconds per side</b>, 2–3 rounds.',comfy:'Hold for <b>30 seconds per side</b>, reaching your top arm up.'}},
  yoga_side_bend:{
    cues:[
      ['Start in Mountain','Stand tall with feet together or hip-width apart.'],
      ['Arms overhead','Raise both arms overhead. Join your palms or clasp your hands with index fingers pointing up.'],
      ['Lengthen first','Breathe in and stretch upward to lengthen your spine before bending.'],
      ['Lean to one side','Breathe out and lean smoothly to the right from your waist, keeping your hips steady and chest facing forward.'],
      ['Return and switch','Breathe in to come back to center, then lean to the left.']],
    worries:{
      back:['Lower back discomfort',['Make the lean smaller and keep your belly drawn in.','Stop if you feel sharp pain.']],
      balance:['Losing balance',['Take your feet hip-width apart.','Look at a fixed point in front of you.']],
      shoulders:['Tight shoulders',['Keep your arms shoulder-width apart instead of joining your palms.','Place one hand on your hip and lift the other arm.']],
      hips:['Hips swaying out',['Press your feet evenly into the floor.','Imagine standing between two panes of glass.']]},
    plan:{never:'Do <b>3 slow leans per side</b>, holding each for 5 seconds.',few:'Do <b>5 slow leans per side</b>, holding each for 5–8 seconds.',comfy:'Hold each side for <b>15–20 seconds</b>, 2–3 rounds.'}},
  yoga_prayer:{
    cues:[
      ['Start in Mountain','Stand tall with your feet together and your weight even on both feet.'],
      ['Bring palms together','Breathe in and bring your palms together at the center of your chest.'],
      ['Thumbs to chest','Rest your thumbs lightly against your breastbone. Let your elbows relax down and out.'],
      ['Shoulders down','Drop your shoulders away from your ears and lift your chest gently.'],
      ['Breathe and settle','Close your eyes or soften your gaze. Breathe slowly and stay still.']],
    worries:{
      shoulders:['Shoulders tense',['Drop your shoulders down and back.','Take a slow breath out to release tension.']],
      balance:['Feeling unsteady',['Take your feet hip-width apart.','Keep your eyes open and fix them on one spot.']],
      wrists:['Wrist tightness',['Bring your hands slightly lower toward your belly.','Press your palms lightly instead of hard.']],
      focus:['Restless mind',['Count 10 slow breaths.','Let each breath out be slower than the breath in.']]},
    plan:{never:'Hold for <b>20 seconds</b>, 3 rounds.',few:'Hold for <b>30 seconds</b>, 3 rounds.',comfy:'Hold for <b>60 seconds</b> while breathing slowly.'}}
};
const sg = {ex:null, exp:null, worry:null, cue:0, speak:false, fromPicker:false};
const SG_NONE = ['Nothing in particular',['Keep the same tempo every rep and focus on smooth, controlled movement.','Use the AI camera next to check your form.']];

function sgEx(){ return EXERCISES.find(e=>e.id===sg.ex); }
function sgEnsureModal(){
  if(el('sg-backdrop')) return;
  const d = document.createElement('div');
  d.className = 'sg-backdrop'; d.id = 'sg-backdrop';
  d.innerHTML = '<div class="sg-modal" role="dialog" aria-modal="true" aria-label="Exercise guide"><button class="sg-close" aria-label="Close" onclick="closeExerciseGuide()">✕</button><div id="sg-content"></div></div>';
  d.addEventListener('click', e=>{ if(e.target===d) closeExerciseGuide(); });
  document.body.appendChild(d);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && d.classList.contains('open')) closeExerciseGuide(); });
}
// openExerciseGuide('pushup') jumps straight to that exercise's questions;
// openExerciseGuide() lets the person pick the exercise first.
function openExerciseGuide(id){
  sgEnsureModal();
  sg.exp = null; sg.worry = null; sg.cue = 0;
  sg.fromPicker = !(id && GUIDE_DATA[id]);
  sg.ex = sg.fromPicker ? null : id;
  if(sg.ex) sgRenderForm(); else sgRenderPicker();
  el('sg-backdrop').classList.add('open');
}
function closeExerciseGuide(){
  const b = el('sg-backdrop'); if(b) b.classList.remove('open');
  if('speechSynthesis' in window) speechSynthesis.cancel();
  const v = document.querySelector('#sg-content video'); if(v) v.pause();
}
function sgRenderPicker(){
  el('sg-content').innerHTML = `
    <div class="sg-title">📖 Exercise Guide</div>
    <div class="small-muted">Which exercise do you want a step-by-step guide for?</div>
    <div class="exercise-picker sg-picker">
      ${EXERCISES.filter(e=>GUIDE_DATA[e.id]).map(e=>`<button class="pick-card" onclick="sgChooseEx('${e.id}')"><div class="ic">${e.icon}</div><div class="n">${e.name}</div>${e.hi?`<div class="n-hi">${e.hi}</div>`:''}</button>`).join('')}
    </div>`;
}
function sgChooseEx(id){ sg.ex = id; sg.exp = null; sg.worry = null; sgRenderForm(); }
function sgChip(group, val, label){
  const on = sg[group]===val ? ' sel' : '';
  return `<button class="sg-chip${on}" onclick="sgPick('${group}','${val}')">${label}</button>`;
}
function sgPick(group, val){ sg[group]=val; sgRenderForm(); }
function sgRenderForm(){
  const ex = sgEx(), data = GUIDE_DATA[sg.ex];
  const ready = sg.exp && sg.worry;
  const worryChips = Object.keys(data.worries).map(k=>sgChip('worry',k,data.worries[k][0])).join('') + sgChip('worry','none',SG_NONE[0]);
  el('sg-content').innerHTML = `
    <div class="sg-title">${ex.icon} ${ex.name} Guide</div>${yogaNameLine(ex)}
    <div class="small-muted">Two quick questions and I'll walk you through it.</div>
    <div class="sg-q">
      <div class="sg-q-lbl">1. Have you done ${ex.name.toLowerCase()} before?</div>
      <div class="sg-chips">${sgChip('exp','never','Never tried')}${sgChip('exp','few','A few times')}${sgChip('exp','comfy','Fairly comfortable')}</div>
    </div>
    <div class="sg-q">
      <div class="sg-q-lbl">2. What worries you most?</div>
      <div class="sg-chips">${worryChips}</div>
    </div>
    <div class="sg-foot">
      <button class="btn btn-volt" ${ready?'':'disabled style="opacity:.45;cursor:not-allowed;"'} onclick="${ready?'sgStartGuide()':''}">Build my guide ▶</button>
      ${sg.fromPicker?'<button class="btn btn-ghost" onclick="sgRenderPicker()">← Change exercise</button>':''}
    </div>`;
}
function sgStartGuide(){ sg.cue = 0; sgRenderGuide(); }
function sgRenderGuide(){
  const keepVid = document.querySelector('#sg-content .sg-video video'); // keep demo playing between steps
  const ex = sgEx(), data = GUIDE_DATA[sg.ex];
  const cue = data.cues[sg.cue], last = sg.cue===data.cues.length-1;
  const tipSrc = sg.worry==='none' ? SG_NONE : data.worries[sg.worry];
  const tips = tipSrc[1].map(t=>`<li>${t}</li>`).join('');
  const vid = GUIDE_VIDEOS[sg.ex]; let vidSrc = null; try{ vidSrc = vid ? vid.src() : null; }catch(e){ vidSrc = null; }
  const media = vidSrc
    ? `<div class="sg-video${vid.wide?' sg-wide':''}"><video src="${vidSrc}" autoplay loop muted playsinline></video></div>`
    : `<div class="sg-visual"><div class="sg-visual-ic">${ex.icon}</div><div class="sg-visual-name">${ex.name}</div><div class="sg-visual-lbl">Muscles worked</div><div class="sg-visual-txt">${ex.muscles.join(', ')}</div><div class="sg-visual-lbl">Key form point</div><div class="sg-visual-txt">${ex.formNote}</div></div>`;
  el('sg-content').innerHTML = `
    <div class="sg-title">${ex.icon} Your ${ex.name.toLowerCase()} guide</div>${yogaNameLine(ex)}
    <div class="sg-body">
      ${media}
      <div class="sg-main">
        <div class="sg-cue">
          <div class="sg-cue-step">Step ${sg.cue+1} of ${data.cues.length}</div>
          <div class="sg-cue-head">${cue[0]}</div>
          <div class="sg-cue-txt">${cue[1]}</div>
        </div>
        <div class="sg-nav">
          <button class="btn btn-ghost btn-sm" ${sg.cue===0?'disabled style="opacity:.45;"':''} onclick="sgStep(-1)">← Back</button>
          <div class="sg-dots">${data.cues.map((_,i)=>`<span class="sg-dot${i===sg.cue?' on':''}"></span>`).join('')}</div>
          <button class="btn btn-volt btn-sm" ${last?'disabled style="opacity:.45;"':''} onclick="sgStep(1)">Next →</button>
        </div>
        <div class="sg-nav" style="margin-top:6px;">
          <button class="btn btn-ghost btn-sm" onclick="sgToggleSpeak()">${sg.speak?'🔊 Read aloud: On':'🔈 Read aloud: Off'}</button>
        </div>
        <div class="sg-tips"><b>Tips for you</b><ul>${tips}</ul></div>
        <div class="sg-plan">${data.plan[sg.exp]}</div>
      </div>
    </div>
    <div class="sg-foot">
      <button class="btn btn-volt" onclick="closeExerciseGuide();openCoachWith('${sg.ex}')">Practice with AI camera ▶</button>
      <button class="btn btn-ghost" onclick="sgRenderForm()">Change answers</button>
    </div>
    <div class="sg-safe">General fitness guidance, not medical advice. Stop if you feel sharp pain or dizziness.</div>`;
  if(keepVid){ const nv = document.querySelector('#sg-content .sg-video video'); if(nv) nv.replaceWith(keepVid); }
  if(sg.speak) sgSay(`${cue[0]}. ${cue[1]}`);
}
// sgNext/sgPrev aliases (reference uses sgStep; kept for compat)
function sgNext(){ sgStep(1); }
function sgPrev(){ sgStep(-1); }
function sgStep(d){
  const n = GUIDE_DATA[sg.ex].cues.length;
  sg.cue = Math.max(0, Math.min(n-1, sg.cue+d));
  sgRenderGuide();
}
function sgToggleSpeak(){
  sg.speak = !sg.speak;
  if(!sg.speak && 'speechSynthesis' in window) speechSynthesis.cancel();
  sgRenderGuide();
}
function sgSay(text){
  if(!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0; speechSynthesis.speak(u);
}

/* ================= AI COACH ================= */
const POSE_CONNECTIONS_FALLBACK = null; // provided by mediapipe drawing_utils global if loaded

function renderCoach(){
  const c=state.coach;
  const ex = EXERCISES.find(e=>e.id===c.selectedExercise);
  if(!ex){
    el('view-coach').innerHTML = `
      <div class="pagehead"><div><h1 class="display">AI Coach</h1><p>Select an exercise to begin your AI-guided session.</p></div></div>
      <div class="sg-promo">
        <div class="sg-promo-ic">📖</div>
        <div class="sg-promo-txt">
          <div class="sg-promo-title">New to an exercise? Get a guided walkthrough</div>
          <div class="small-muted">Pick any exercise, answer 2 quick questions, and the AI guide will walk you through it step by step with tips for your situation.</div>
        </div>
        <button class="btn btn-volt btn-sm" onclick="openExerciseGuide()">Guide me ▶</button>
      </div>
      <div class="exercise-picker">
        ${EXERCISES.map(e=>`<button class="pick-card" onclick="openCoachWith('${e.id}')"><div class="ic">${e.icon}</div><div class="n">${e.name}</div>${e.hi?`<div class="n-hi">${e.hi}</div>`:''}</button>`).join('')}
      </div>
      <div class="privacy-note">🔒 Your camera feed is processed locally in your browser for pose estimation and is never uploaded or stored.</div>`;
    return;
  }
  el('view-coach').innerHTML = `
    <div class="pagehead">
      <div><h1 class="display">${ex.icon} ${ex.name}</h1>${yogaNameLine(ex)}<p>${ex.desc}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="openExerciseGuide('${ex.id}')">📖 ${ex.name} Guide</button>
        <button class="btn btn-ghost" onclick="state.coach.selectedExercise=null;stopCamera();renderCoach();">← Change Exercise</button>
      </div>
    </div>
    <div class="coach-layout">
      <div>
        <div class="cam-wrap" id="cam-wrap">
          <video id="cam-video" autoplay playsinline muted></video>
          <canvas id="cam-canvas"></canvas>
          <div class="cam-placeholder" id="cam-placeholder">
            <div class="bigic">🎥</div>
            <div>Camera is off. Allow camera access to start AI form analysis for <b>${ex.name}</b>.</div>
            ${ex.id==='pushup'||ex.id==='plank'||ex.id==='lunge'?'<div class="small-muted">Tip: turn side-on to the camera for best results.</div>':''}
            <button class="btn btn-volt" onclick="startCamera()">Allow Camera & Start</button>
          </div>
          <div class="cam-loading hidden" id="cam-loading">
            <div class="cam-spinner"></div>
            <div class="msg" id="cam-loading-msg">Requesting camera access...</div>
            <div class="sub">Pose landmarks are computed locally in your browser.</div>
            <button class="btn btn-volt btn-sm hidden" id="cam-retry" onclick="resumeCamera()">Retry</button>
          </div>
          <div class="cam-overlay-top hidden" id="cam-top">
            <div class="hud-pill">${ex.icon} ${ex.name}</div>
            <div class="hud-pill hud-conf"><span class="dot lo" id="conf-dot"></span><span id="conf-text">—</span></div>
            <button class="hud-pill voice-toggle-btn" style="cursor:pointer;" onclick="toggleVoice()">🔒 Voice</button>
          </div>
          <div class="cam-overlay-bottom hidden" id="cam-bottom">
            <div>
              <div class="rep-count" id="rep-count">0</div>
              <div class="rep-count-lbl">Rep ${isHoldEx(ex)?'/ hold time':''} · Set ${c.sets}/${c.setTarget}</div>
            </div>
            <div class="feedback-toast" id="feedback-toast">Get into position</div>
          </div>
        </div>
        <div class="privacy-note">🔒 Camera frames are processed locally for pose landmarks and are not uploaded or permanently stored. This estimates form — it isn't a medical diagnosis.</div>
        <div class="small-muted" id="coach-debug" style="font-size:11px;opacity:.75;margin-top:6px;">⚙️ starting…</div>
      </div>
      <div class="coach-side">

        <!-- ── LIVE STATS card ── -->
        <div class="card">
          <div class="card-title">Live Stats</div>
          <div class="ls-grid">
            <div class="ls-tile volt">
              <div class="ls-val" id="ls-reps">0</div>
              <div class="ls-lbl">Reps</div>
            </div>
            <div class="ls-tile blue">
              <div class="ls-val" id="ls-set">${c.sets}/${c.setTarget}</div>
              <div class="ls-lbl">Set</div>
            </div>
            <div class="ls-tile green">
              <div class="ls-val" id="ls-form">100</div>
              <div class="ls-lbl">Form %</div>
            </div>
            <div class="ls-tile coral">
              <div class="ls-val" id="ls-conf">0%</div>
              <div class="ls-lbl">Pose Conf.</div>
            </div>
          </div>
          <div class="ls-sets-label">Sets progress</div>
          <div class="ls-sets-bar-outer">
            <div class="ls-sets-bar-inner" id="ls-sets-bar" style="width:${Math.round(((c.sets-1)/c.setTarget)*100)}%"></div>
          </div>
          <div class="ls-row"><span>Timer</span><span id="ls-timer">00:00</span></div>
          <div class="ls-row"><span>Calories (est.)</span><span id="ls-cal">0</span></div>
          <div class="ls-row" style="border-bottom:none;">
            <span>Movement Phase</span>
            <span><span class="phase-badge" id="ls-phase">—</span></span>
          </div>
        </div>

        <!-- ── FORM SCORE card (unchanged position) ── -->
        <div class="card" style="text-align:center;">
          <div class="card-title">Form Score</div>
          <div class="form-score-ring">
            <svg width="110" height="110"><circle cx="55" cy="55" r="46" stroke="#242938" stroke-width="10" fill="none"/><circle id="score-circle" cx="55" cy="55" r="46" stroke="#d4ff3f" stroke-width="10" fill="none" stroke-dasharray="${2*Math.PI*46}" stroke-dashoffset="${2*Math.PI*46}" stroke-linecap="round" transform="rotate(-90 55 55)"/></svg>
            <div class="val"><b id="score-num">--</b><span class="small-muted">/ 100</span></div>
          </div>
          <div class="breakdown-row"><span>Posture</span><span id="bd-posture">--</span></div>
          <div class="breakdown-row"><span>Alignment</span><span id="bd-align">--</span></div>
          <div class="breakdown-row"><span>Depth / Range</span><span id="bd-depth">--</span></div>
        </div>

        <!-- ── SESSION STATS card (unchanged) ── -->
        <div class="card">
          <div class="card-title">Session Stats</div>
          <div class="breakdown-row"><span>Timer</span><span id="stat-timer">00:00</span></div>
          <div class="breakdown-row"><span>Calories (est.)</span><span id="stat-cal">0</span></div>
          <div class="breakdown-row"><span>AI Confidence</span><span id="stat-conf-2">—</span></div>
        </div>

        <!-- ── CONTROLS card (unchanged) ── -->
        <div class="card">
          <div class="card-title">Controls</div>
          <div class="field"><label>Set Target (1–5)</label><select id="set-target" onchange="setSetTarget(this.value)">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===(c.setTarget||3)?'selected':''}>${n} sets</option>`).join('')}</select></div>
          <button class="btn btn-ghost btn-block" onclick="pauseCoach()" id="btn-pause">Pause</button>
          <button class="btn btn-outline btn-block mt" onclick="finishWorkoutSession()">Finish Workout</button>
        </div>

        <!-- ── VOICE CONTROL panel (Premium-gated) ── -->
        <div class="card">
          <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>Voice Control</span>
            ${state.premium?'':'<span>🔒</span>'}
          </div>
          <p class="small-muted" style="margin:2px 0 12px;">${state.premium
            ? 'Spoken coaching cues as you train — hands-free feedback.'
            : 'Spoken coaching cues as you train. Premium only.'}</p>
          <button class="btn btn-outline btn-block voice-toggle-btn" onclick="toggleVoice()">🔒 Voice · Premium</button>
        </div>
      </div>
    </div>`;
  const _coachEx = EXERCISES.find(e=>e.id===c.selectedExercise);
  el('rep-count').textContent = (_coachEx && isHoldEx(_coachEx)) ? formatTime(c.holdSeconds) : Math.floor(c.reps);
  syncVoiceButtons();
}
function formatTime(s){s=Math.floor(s);const m=Math.floor(s/60);const r=s%60;return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');}

let mpPose=null, mpCamera=null, rafTimer=null;
let firstPoseSeen=false, reinitInFlight=false;
/* Phones can't do what PCs do: 1080p starves the frame loop and the Full
   pose model stutters. Detect coarse-pointer/small-screen devices and
   step down to 720p + Lite model. PCs keep 1080p + Full. */
function coachMobile(){
  try{
    if(window.matchMedia && matchMedia('(pointer:coarse)').matches) return true;
    if(Math.min(screen.width||9999, screen.height||9999) < 500) return true;
  }catch(e){}
  return false;
}
function coachCamConstraints(){
  if(coachMobile()) return {video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false};
  return {video:{width:{ideal:1920},height:{ideal:1080},facingMode:'user'},audio:false};
}
/* Old/weak phones may reject even 720p — retry with no resolution ask
   (browser picks whatever the front camera can do) before giving up. */
async function openCoachStream(){
  try{
    return await navigator.mediaDevices.getUserMedia(coachCamConstraints());
  }catch(e){
    if(e && e.name==='OverconstrainedError'){
      return await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    }
    throw e;
  }
}
/* Pose engine setup only (no session reset) — reused by start + auto-reconnect.
   Resolves on first pose result, rejects after 25s so a stalled CDN
   never spins the loader forever. */
function initPoseEngine(){
  const c=state.coach;
  return new Promise((resolve,reject)=>{
    try{
      if(typeof Pose==='undefined' || typeof Camera==='undefined'){ reject(new Error('pose-missing')); return; }
      const loadingMsg = el('cam-loading-msg');
      if(loadingMsg) loadingMsg.textContent='Loading AI pose model...';
      try{ if(mpPose && mpPose.close) mpPose.close(); }catch(e){}
      mpPose = new Pose({locateFile:(f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
      mpPose.setOptions({modelComplexity:coachMobile()?0:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
      mpPose.onResults(onPoseResults);
      const video = el('cam-video');
      if(!video){ reject(new Error('no-video')); return; }
      mpCamera = new Camera(video,{onFrame: async()=>{
        if(!c.running) return;
        // Slow phones: never pile up inferences — drop the frame if the
        // previous one is still being processed.
        if(c.sendBusy) return;
        c.sendBusy=true;
        try{
          await Promise.race([
            mpPose.send({image:video}),
            // Hung inference (weak phone runs out of steam): a send that
            // never settles would freeze the loop forever with no error.
            // Time out, kill the poisoned engine, rebuild it via reinit
            // (reps/sets/seconds preserved; Retry screen after 3 fails).
            new Promise((_,rej)=>setTimeout(()=>rej(new Error('pose-send-timeout')),8000))
          ]);
        }
        catch(err){
          c.consecFail=(c.consecFail||0)+1;
          if(err && err.message==='pose-send-timeout'){
            try{ if(mpPose && mpPose.close) mpPose.close(); }catch(e){}
            mpPose=null;
            softReinitCoach();
          }
          // A single bad frame (e.g. 1s net jitter on WASM fetch) must not kill the loop.
          else if(c.consecFail>=30){ c.consecFail=0; softReinitCoach(); }
        }
        finally{ c.sendBusy=false; }
      },width:coachMobile()?1280:1920,height:coachMobile()?720:1080});
      mpCamera.start();
      const t0=Date.now();
      const iv=setInterval(()=>{
        if(firstPoseSeen){ clearInterval(iv); resolve(); }
        else if(Date.now()-t0>25000){ clearInterval(iv); reject(new Error('pose-timeout')); }
      },500);
    }catch(err){ reject(err); }
  });
}
/* Soft reconnect that PRESERVES reps/sets/seconds — called by the frame guard
   and the watchdog when the AI signal stalls (internet blip). */
async function softReinitCoach(){
  const c=state.coach;
  if(reinitInFlight || !c.selectedExercise || !c.stream) return;
  c.reinitTries=(c.reinitTries||0)+1;
  if(c.reinitTries>3){
    try{ if(mpCamera){ try{mpCamera.stop();}catch(e){} } }catch(e){}
    mpCamera=null;
    setFeedback('AI disconnected. Your reps are safe — press Retry.','lo');
    const rl=el('cam-loading');
    if(rl){
      rl.classList.remove('hidden');
      const lm=el('cam-loading-msg'); if(lm) lm.textContent='AI disconnected — your session (reps/sets/time) is preserved.';
      const rb=el('cam-retry'); if(rb) rb.classList.remove('hidden');
    }
    return;
  }
  reinitInFlight=true;
  toast('<b>AI hiccup</b><br>Reconnecting… your session is safe ('+c.reinitTries+'/3).');
  try{ if(mpCamera){ try{mpCamera.stop();}catch(e){} } mpCamera=null; }catch(e){}
  try{ await initPoseEngine(); c.consecFail=0; }
  catch(e){ /* watchdog / next failure cycle will retry */ }
  reinitInFlight=false;
}
function showCoachRetry(msg){
  const rl=el('cam-loading');
  if(rl){
    rl.classList.remove('hidden');
    const lm=el('cam-loading-msg'); if(lm) lm.textContent=msg;
    const rb=el('cam-retry'); if(rb) rb.classList.remove('hidden');
  }
}
/* Manual retry that RESUMES the session (no rep/set/time reset).
   Re-requests camera only if the old stream died. */
async function resumeCamera(){
  const c=state.coach;
  if(!c.selectedExercise) return;
  const rb=el('cam-retry'); if(rb) rb.classList.add('hidden');
  const rl=el('cam-loading');
  if(rl){ rl.classList.remove('hidden'); const lm=el('cam-loading-msg'); if(lm) lm.textContent='Reconnecting…'; }
  try{
    const dead = !c.stream || c.stream.getTracks().every(t=>t.readyState==='ended');
    if(dead){
      const stream = await openCoachStream();
      c.stream = stream;
      const video = el('cam-video'); if(video) video.srcObject = stream;
    }
    c.reinitTries=0; c.consecFail=0; c.stallNotified=false;
    await initPoseEngine();
    c.running=true;
    const b=el('btn-pause'); if(b) b.textContent='Pause';
    tickTimer();
    if(rl) rl.classList.add('hidden');
    toast('<b>Reconnected</b><br>Picking up where you left off.');
  }catch(err){
    showCoachRetry('Reconnect failed — check camera and internet, then retry.');
  }
}
async function startCamera(){
  const ex = EXERCISES.find(e=>e.id===state.coach.selectedExercise);
  const c=state.coach;
  c.reps=0;c.sets=1;c.formScore=100;c.phase='neutral';c.holdSeconds=0;c.seconds=0;c.altState={left:'up',right:'up'};
  c.angleHistory=[];c.smoothAngle=null;c.peakAngle=null;c.valleyAngle=null;c.repLocked=false;c.framesSincePhase=0;c.neutralFrames=0;
  c.sessionStartCalories = state.totalCalories||0; c.sessionCalories = 0; c.sessionStartReps = state.totalReps||0;
  c.lastFormPush = 0;
  c.consecFail=0; c.reinitTries=0; c.lastResultAt=0; c.stallNotified=false; c.sendBusy=false;
  firstPoseSeen=false; reinitInFlight=false;
  el('cam-placeholder').classList.add('hidden');
  el('cam-loading').classList.remove('hidden');
  const rb0=el('cam-retry'); if(rb0) rb0.classList.add('hidden');
  el('cam-loading-msg').textContent='Requesting camera access...';
  try{
    const stream = await openCoachStream();
    c.stream = stream;
    const video = el('cam-video');
    video.srcObject = stream;
    c.running=true;
    c.startTime=Date.now();
    await initPoseEngine();
    tickTimer();
  }catch(err){
    const kind = (err&&(err.message||'')).toString();
    el('cam-loading').classList.add('hidden');
    if(kind.indexOf('pose-missing')>=0){
      el('cam-placeholder').classList.remove('hidden');
      toast('<b>Model Error</b><br>AI scripts blocked — connect once to load, then retry.');
    } else if(kind.indexOf('pose-timeout')>=0){
      showCoachRetry('Model download stalled (weak internet). Reps not started — safe to retry.');
      toast('<b>Slow connection</b><br>Model timed out loading. Press Retry.');
    } else {
      el('cam-placeholder').classList.remove('hidden');
      toast('<b>Camera Error</b><br>Permission denied or unavailable.');
    }
  }
}
function stopCamera(){
  const c=state.coach;
  c.running=false;
  if(mpCamera){ try{mpCamera.stop();}catch(e){} mpCamera=null; }
  if(mpPose){ try{ if(mpPose.close) mpPose.close(); }catch(e){} mpPose=null; }
  if(c.stream){ c.stream.getTracks().forEach(t=>t.stop()); c.stream=null; }
  if(rafTimer){clearInterval(rafTimer);rafTimer=null;}
  firstPoseSeen=false; reinitInFlight=false;
  try{ if(typeof Voice!=='undefined' && Voice) Voice.stop(); }catch(e){}
}
function tickTimer(){
  if(rafTimer) clearInterval(rafTimer);
  rafTimer=setInterval(()=>{
    const c=state.coach;
    if(!c.running) return;
    c.seconds++;
    const t=el('stat-timer'); if(t) t.textContent=formatTime(c.seconds);
    // Watchdog: pose results stopped arriving (internet/WASM stall)?
    // Timer + reps state keep running — just flag it and let the frame
    // guard / soft-reconnect bring the signal back. No session loss.
    if(firstPoseSeen && c.lastResultAt && (Date.now()-c.lastResultAt>4000) && !c.stallNotified){
      c.stallNotified=true;
      setFeedback('Signal hiccup — hold position, auto-resuming…','lo');
    }
    syncLiveStats();
  },1000);
}
// Background tabs throttle the camera loop but not the clock — auto-pause
// instead of letting timer and reps drift apart.
document.addEventListener('visibilitychange', ()=>{
  const c=(typeof state!=='undefined')?state.coach:null;
  if(document.hidden && c && c.running && c.selectedExercise){
    c.running=false;
    const b=el('btn-pause'); if(b) b.textContent='Resume';
    toast('<b>Paused</b><br>Tab hidden — resume when you are back.');
  }
});
function pauseCoach(){
  const c=state.coach;
  c.running=!c.running;
  el('btn-pause').textContent = c.running?'Pause':'Resume';
  try{
    if(typeof Voice!=='undefined' && Voice){
      if(!c.running) Voice.stop();
      else Voice.say('Resuming.', {level:'hi', force:true});
    }
  }catch(e){}
}
function setSetTarget(v){
  const n = clamp(parseInt(v,10)||3, 1, 5);
  state.coach.setTarget = n;
  // keep current set within new target
  if(state.coach.sets > n) state.coach.sets = n;
  syncLiveStats();
  const lbl = document.querySelector('.rep-count-lbl');
  if(lbl){
    const ex = EXERCISES.find(e=>e.id===state.coach.selectedExercise);
    lbl.textContent = `Rep ${ex && ex.engine==='hold'?'/ hold time':''} · Set ${state.coach.sets}/${n}`;
  }
  const sel = el('ls-set'); if(sel) sel.textContent = state.coach.sets+'/'+n;
}

/* ---- geometry helpers ---- */
function angleBetween(a,b,c){
  const ab={x:a.x-b.x,y:a.y-b.y}; const cb={x:c.x-b.x,y:c.y-b.y};
  const dot=ab.x*cb.x+ab.y*cb.y;
  const magA=Math.hypot(ab.x,ab.y), magC=Math.hypot(cb.x,cb.y);
  if(magA===0||magC===0) return 0;
  let cos=dot/(magA*magC); cos=clamp(cos,-1,1);
  return Math.acos(cos)*180/Math.PI;
}
const LM = {LSH:11,RSH:12,LEL:13,REL:14,LWR:15,RWR:16,LHIP:23,RHIP:24,LKNE:25,RKNE:26,LANK:27,RANK:28,LHEEL:29,RHEEL:30,LFOOT:31,RFOOT:32,NOSE:0};

function jointAngle(lms,joint,side){
  const map = {
    knee:         [LM[side+'HIP'],LM[side+'KNE'],LM[side+'ANK']],
    elbow:        [LM[side+'SH'],LM[side+'EL'],LM[side+'WR']],
    hip:          [LM[side+'SH'],LM[side+'HIP'],LM[side+'KNE']],
    ankle:        [LM[side+'KNE'],LM[side+'ANK'],LM[side+'FOOT']],
    // Shoulder elevation: measures how high the elbow is relative to hip→shoulder line.
    // Angle at the SHOULDER between hip, shoulder, elbow.
    // ~20-40° = arm by side, ~150-170° = arm fully overhead.
    shoulder_elev:[LM[side+'HIP'],LM[side+'SH'],LM[side+'EL']],
  };
  const idx = map[joint];
  if(!idx) return null;
  const [a,b,cc] = idx.map(i=>lms[i]);
  if(!a||!b||!cc) return null;
  if((a.visibility??1)<0.3 || (b.visibility??1)<0.3 || (cc.visibility??1)<0.3) return null;
  return angleBetween(a,b,cc);
}
function avgVisibility(lms,indices){
  const vs = indices.map(i=>lms[i]?.visibility ?? 0);
  return vs.reduce((a,b)=>a+b,0)/vs.length;
}
// Takes the better-visible side of each L/R landmark pair before averaging,
// so side-on exercises (push-up, plank, lunge) where the far side is
// partially occluded don't get penalized as "low confidence".
function bestSideVisibility(lms,pairs){
  const scores = pairs.map(([l,r])=>Math.max(lms[l]?.visibility ?? 0, lms[r]?.visibility ?? 0));
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}

/* ---- skeleton overlay (self-contained, doesn't depend on drawing_utils) ---- */
// Standard 33-point MediaPipe Pose connections, trimmed to the ones that
// read clearly on screen (face outline kept minimal, limbs/torso in full).
const SKELETON_LINKS = [
  [11,12],[11,23],[12,24],[23,24],                      // shoulders/hips box
  [11,13],[13,15],[12,14],[14,16],                      // arms
  [15,17],[15,19],[15,21],[16,18],[16,20],[16,22],      // hands
  [23,25],[25,27],[24,26],[26,28],                      // legs
  [27,29],[27,31],[28,30],[28,32],                      // feet
  [7,8],[9,10],                                          // ears/mouth line
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],       // eyes/brow-ish outline
];
const MAJOR_JOINTS = new Set([11,12,13,14,15,16,23,24,25,26,27,28]);
function drawSkeleton(ctx,lms,w,h){
  const pt = i => lms[i] && (lms[i].visibility??1)>0.4 ? {x:lms[i].x*w,y:lms[i].y*h} : null;
  ctx.save();
  ctx.lineCap='round';
  // glow pass
  ctx.shadowColor='rgba(212,255,63,0.85)'; ctx.shadowBlur=8;
  ctx.strokeStyle='#d4ff3f'; ctx.lineWidth=3.5;
  SKELETON_LINKS.forEach(([a,b])=>{
    const pa=pt(a), pb=pt(b);
    if(!pa||!pb) return;
    ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.stroke();
  });
  ctx.shadowBlur=0;
  // joints
  lms.forEach((l,i)=>{
    if((l.visibility??1)<=0.4) return;
    const major = MAJOR_JOINTS.has(i);
    const x=l.x*w, y=l.y*h;
    ctx.beginPath();
    ctx.arc(x,y,major?7:4,0,Math.PI*2);
    ctx.fillStyle = major ? '#ffffff' : '#d4ff3f';
    ctx.fill();
    if(major){ ctx.lineWidth=2; ctx.strokeStyle='#0b0d10'; ctx.stroke(); }
  });
  ctx.restore();
}

/* HUD throttle: the pose loop fires per frame, but DOM writes (stat tiles,
   score ring) every frame crush weak phone CPUs and starve the WASM pose
   inference — frames slow to a trickle and rep counting freezes. Cap these
   side-effects at ~4Hz/2.5Hz; counting logic itself stays per-frame. */
// Build tag: bump on every coach fix. Shown in the on-screen debug line so a
// bug report identifies EXACTLY which code ran (kills stale-cache confusion).
const FQ_BUILD='p2-pressrel';
function hudDue(key, ms){
  const c=state.coach, now=Date.now(), k='_hud_'+key;
  if(c[k] && now-c[k]<ms) return false;
  c[k]=now; return true;
}
function updateCoachDebug(){
  const d=el('coach-debug'); if(!d) return;
  const c=state.coach;
  const a = c.lastAngle==null ? '—' : Math.round(c.lastAngle)+'°';
  const p = c.peakAngle==null ? '—' : Math.round(c.peakAngle);
  const v = c.valleyAngle==null ? '—' : Math.round(c.valleyAngle);
  d.textContent = `⚙️ b${FQ_BUILD} · ${c.fps||0}fps · f${c.frames||0} · ${c.phase||'—'} · ∠${a} · P${p}/V${v}`;
}
function onPoseResults(results){
  const c0=state.coach;
  c0.lastResultAt=Date.now(); c0.consecFail=0;
  // Frame/FPS accounting for the on-screen debug line (diagnoses stuck counters)
  const _fn=Date.now();
  c0.frames=(c0.frames||0)+1;
  if(!c0._fpsT || _fn-c0._fpsT>=1000){
    c0.fps=Math.round((c0.frames-(c0._fpsF||0))*1000/Math.max(1,_fn-(c0._fpsT||_fn)));
    c0._fpsT=_fn; c0._fpsF=c0.frames;
  }
  if(c0.stallNotified){ c0.stallNotified=false; setFeedback('Signal restored — keep going!','hi'); }
  const canvas=el('cam-canvas'), video=el('cam-video');
  if(!canvas||!video) return;
  canvas.width = video.videoWidth||1280; canvas.height = video.videoHeight||720;
  const ctx = canvas.getContext('2d');
  ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(results.image,0,0,canvas.width,canvas.height);

  const lms = results.poseLandmarks;

  if(!firstPoseSeen){
    firstPoseSeen=true;
    el('cam-loading').classList.add('hidden');
    el('cam-top').classList.remove('hidden');
    el('cam-bottom').classList.remove('hidden');
    syncVoiceButtons();
    try{
      const _ex0 = EXERCISES.find(e=>e.id===state.coach.selectedExercise);
      if(_ex0 && typeof Voice!=='undefined' && Voice) Voice.say(`You're set. Let's start ${_ex0.name}.`, {level:'hi', force:true});
    }catch(e){}
  }

  if(!lms){
    setFeedback('No person detected. Please stand 2–3 meters from the camera.', 'lo');
    ctx.restore();
    return;
  }
  const px = lms.map(p=>({x:p.x*canvas.width,y:p.y*canvas.height,visibility:p.visibility}));
  drawSkeleton(ctx, lms, canvas.width, canvas.height);
  ctx.restore();

  const overallVis = bestSideVisibility(lms,[[LM.LSH,LM.RSH],[LM.LHIP,LM.RHIP],[LM.LKNE,LM.RKNE]]);
  let confLabel='LOW', dotClass='lo';
  if(overallVis>0.75){confLabel='HIGH';dotClass='hi';}
  else if(overallVis>0.45){confLabel='MEDIUM';dotClass='med';}
  el('conf-dot').className='dot '+dotClass;
  el('conf-text').textContent=confLabel+' CONFIDENCE';
  el('stat-conf-2').textContent=confLabel;
  // Live Stats pose confidence tile
  const confPct = overallVis>0.75 ? Math.round(overallVis*100) : overallVis>0.45 ? Math.round(overallVis*100) : Math.round(overallVis*100);
  const lconf=el('ls-conf'); if(lconf) lconf.textContent=confPct+'%';
  // Also sync phase on pose frames (throttled — see hudDue)
  if(hudDue('hud',250)){ syncLiveStats(); updateCoachDebug(); }

  if(overallVis<0.28){
    setFeedback('Please move your full body into the camera frame.', 'lo');
    return;
  }
  runExerciseEngine(lms);
  drawLiveAngleLabel(ctx, lms, canvas.width, canvas.height);
}
function drawLiveAngleLabel(ctx,lms,w,h){
  const c=state.coach;
  const ex = EXERCISES.find(e=>e.id===c.selectedExercise);
  if(!ex || (ex.engine!=='angle' && ex.engine!=='shoulder_press') || c.lastAngle==null) return;
  const jointKey = ex.engine==='shoulder_press' ? 'shoulder_elev' : ex.joint;
  const side = ['L','R'].find(s=>jointAngle(lms,jointKey,s)!==null) || 'L';
  const map = {knee:[LM[side+'KNE']],elbow:[LM[side+'EL']],hip:[LM[side+'HIP']],ankle:[LM[side+'ANK']],shoulder_elev:[LM[side+'SH']]};
  const idx = map[jointKey] && map[jointKey][0];
  const p = idx!=null ? lms[idx] : null;
  if(!p) return;
  const x=p.x*w, y=p.y*h;
  ctx.save();
  // The canvas is mirrored via CSS (selfie view), so counter-flip locally
  // around the label position or the digits would render backwards.
  ctx.translate(x,y);
  ctx.scale(-1,1);
  ctx.font='600 15px Space Grotesk, sans-serif';
  const label = Math.round(c.lastAngle)+'°';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle='rgba(11,13,16,.75)';
  ctx.beginPath();
  const bx=-tw-26, by=-14, bw=tw+16, bh=24;
  if(ctx.roundRect){ ctx.roundRect(bx,by,bw,bh,8); } else { ctx.rect(bx,by,bw,bh); }
  ctx.fill();
  ctx.fillStyle='#d4ff3f';
  ctx.fillText(label,bx+8,by+17);
  ctx.restore();
}
/* ================= VOICE AI COACH (ported same-to-same from v27 reference, Premium-gated) ================= */
// Speaks coaching feedback aloud using the browser's built-in speech
// synthesis. Runs fully client-side — no audio is recorded or uploaded.
// Free users never hear it: enabled() requires state.premium.
const Voice = (() => {
  let ready = false, chosenVoice = null;
  let lastText = null, lastAt = 0, lastLevel = null;
  const MIN_GAP = { hi: 1500, med: 3200, lo: 6000 }; // ms between repeats per level

  function pickVoice(){
    if(!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    if(!voices.length) return;
    chosenVoice =
      voices.find(v => /en-US|en_US/.test(v.lang) && /Female|Samantha|Zira|Google US English/i.test(v.name)) ||
      voices.find(v => v.lang && v.lang.startsWith('en')) ||
      voices[0];
    ready = true;
  }
  if('speechSynthesis' in window){
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function enabled(){ return !!state.premium && !!(state.settings && state.settings.voiceEnabled) && 'speechSynthesis' in window; }

  function say(text, {level='med', force=false, interrupt=false} = {}){
    if(!enabled() || !text) return;
    const now = Date.now();
    if(!force){
      const gap = MIN_GAP[level] ?? MIN_GAP.med;
      if(text === lastText && (now - lastAt) < gap) return; // same message, too soon
      if(text !== lastText && level === lastLevel && (now - lastAt) < 600) return; // avoid rapid-fire flicker
    }
    if(interrupt || force) speechSynthesis.cancel();
    else if(speechSynthesis.speaking && level !== 'hi') return; // let current line finish for non-urgent lines
    else if(speechSynthesis.speaking && level === 'hi') speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if(chosenVoice) u.voice = chosenVoice;
    u.rate = 1.02; u.pitch = 1.0; u.volume = 1.0;
    speechSynthesis.speak(u);
    lastText = text; lastAt = now; lastLevel = level;
  }
  function stop(){ if('speechSynthesis' in window) speechSynthesis.cancel(); }
  function toggle(){
    if(!state.settings) state.settings = {voiceEnabled:false};
    state.settings.voiceEnabled = !state.settings.voiceEnabled;
    if(!state.settings.voiceEnabled) stop();
    else say('Voice coaching on.', {level:'hi', force:true});
    try{ saveStateToStorage(); }catch(e){}
    syncVoiceButtons();
  }
  return { say, stop, toggle, enabled };
})();

function syncVoiceButtons(){
  const locked = !state.premium;
  const on = state.settings && state.settings.voiceEnabled;
  document.querySelectorAll('.voice-toggle-btn').forEach(btn=>{
    if(locked){ btn.innerHTML = '🔒 Voice · Premium'; btn.classList.remove('on'); }
    else { btn.textContent = on ? '🔊 Voice On' : '🔇 Voice Off'; btn.classList.toggle('on', !!on); }
  });
}
function toggleVoice(){
  if(!state.premium){
    toast('<b>🔒 Voice Coach is Premium</b><br>Upgrade to unlock spoken coaching.');
    setView('paywall');
    return;
  }
  Voice.toggle();
}

function setFeedback(msg,level){
  const f=el('feedback-toast'); if(f) f.textContent=msg;
  try{ if(typeof Voice!=='undefined' && Voice) Voice.say(msg, {level: level||'med'}); }catch(e){}
}

/* ---- Live Stats card sync ---- */
function syncLiveStats(){
  const c=state.coach;
  const _ex = EXERCISES.find(e=>e.id===c.selectedExercise);
  const _isHold = _ex && isHoldEx(_ex);
  // Reps
  const lr=el('ls-reps'); if(lr) lr.textContent = _isHold ? formatTime(c.holdSeconds) : Math.floor(c.reps);
  // Set
  const ls=el('ls-set'); if(ls) ls.textContent = c.sets+'/'+(c.setTarget||3);
  // Form
  const lf=el('ls-form'); if(lf) lf.textContent = c.formScore||100;
  // Sets progress bar
  const bar=el('ls-sets-bar');
  if(bar){ const pct=Math.round(((c.sets-1)/(c.setTarget||3))*100); bar.style.width=Math.min(pct,100)+'%'; }
  // Timer (ls-timer mirrors stat-timer)
  const lt=el('ls-timer'); if(lt) lt.textContent = formatTime(c.seconds||0);
  // Calories — session only (not lifetime total)
  const lc=el('ls-cal'); if(lc) lc.textContent = Math.round((state.totalCalories||0) - (c.sessionStartCalories||0));
  // Movement Phase badge
  const lp=el('ls-phase');
  if(lp){
    const phaseLabels={up:'Extend',down:'Contract',neutral:'Ready',open:'Open',closed:'Closed'};
    lp.textContent = phaseLabels[c.phase] || c.phase || '—';
  }
}

function runExerciseEngine(lms){
  const c=state.coach;
  const ex = EXERCISES.find(e=>e.id===c.selectedExercise);
  if(!ex) return;

  // ── Shared angle-based engines (angle + shoulder_press) ──────────────────
  if(ex.engine==='angle' || ex.engine==='shoulder_press'){

    // 1. Get raw joint angle
    let rawAngle = null;
    if(ex.engine==='shoulder_press'){
      // For shoulder press use the SHOULDER angle (hip-shoulder-elbow) which
      // cleanly measures arm elevation: ~20° at sides, ~170° arms overhead.
      const angL = jointAngle(lms,'shoulder_elev','L');
      const angR = jointAngle(lms,'shoulder_elev','R');
      const valid = [angL,angR].filter(a=>a!==null);
      if(!valid.length){ setFeedback('Show both arms clearly in frame.','lo'); return; }
      rawAngle = valid.reduce((a,b)=>a+b,0)/valid.length;
    } else {
      const angL = jointAngle(lms,ex.joint,'L');
      const angR = jointAngle(lms,ex.joint,'R');
      const valid = [angL,angR].filter(a=>a!==null);
      if(!valid.length){ setFeedback('Adjust position — joint not clearly visible.','lo'); return; }
      rawAngle = valid.reduce((a,b)=>a+b,0)/valid.length;
    }

    // 2. Smoothing: light EMA on PC for fast response; heavier EMA on phones
    //    where the Lite model jitters — without it, spikes break the range
    //    guard and real reps get rejected as "not enough range".
    const emaOld = coachMobile() ? 0.5 : 0.25;
    c.smoothAngle = (c.smoothAngle==null) ? rawAngle : c.smoothAngle*emaOld + rawAngle*(1-emaOld);
    const angle = c.smoothAngle;
    c.lastAngle = angle;

    // 3. Determine which direction is "contracted" (low angle) vs "extended" (high angle).
    //    For shoulder press: low = arms at sides, high = arms overhead.
    //    For invert exercises (curl, sit-up): low = contracted, high = extended.
    //    For normal exercises (squat, lunge…): low = deep, high = extended.
    const isPress   = ex.engine==='shoulder_press';
    const isInvert  = !isPress && ex.invert;

    // Threshold angles — contracted = flexed / deep (low), extended = straight (high).
    // Use min/max so invert exercises (downAngle > upAngle) work correctly.
    // Shoulder press on phones: front camera reads "arms at sides" as ~50-80°
    // (perspective + bent elbows), never reaching the PC-tuned 40°. Mobile
    // uses 55° so real full lowerings count; partial reps still fail.
    const mob = coachMobile();
    const CONTRACTED = isPress ? (mob ? 55 : 40)  : Math.min(ex.downAngle, ex.upAngle);  // shoulder press: arms by sides ~20-50°
    const EXTENDED   = isPress ? 155 : Math.max(ex.downAngle, ex.upAngle);    // shoulder press: fully overhead ~155-170°
    // Hysteresis deadband: must travel at least this many degrees past the
    // transition threshold before the phase flips. Prevents micro-movement counts.
    // Phones get a smaller deadband: Lite-model jitter + low FPS shrink the
    // observed motion, and the strict PC value rejects real reps after rep ~2.
    const HYST = coachMobile() ? 6 : 10; // degrees of required overshoot past threshold

    // 4. Update running peak/valley to track total range of motion this half-rep.
    // Always initialise from current angle so comparisons never operate on null.
    if(c.peakAngle===null || c.peakAngle===undefined) c.peakAngle=angle;
    if(c.valleyAngle===null || c.valleyAngle===undefined) c.valleyAngle=angle;

    // 5. Neutral phase: figure out starting position from the first few frames.
    //    Use a frame counter to auto-exit neutral after enough frames so reps
    //    are never stuck at 0 even when the starting angle is mid-range.
    if(c.phase==='neutral'){
      c.neutralFrames = (c.neutralFrames||0) + 1;
      c.peakAngle  = Math.max(c.peakAngle,  angle);
      c.valleyAngle= Math.min(c.valleyAngle, angle);

      // Decide initial phase: after 8 frames pick whichever boundary the angle
      // is closest to, so we always exit neutral and start counting.
      const shouldInit = c.neutralFrames >= 8
        || angle <= CONTRACTED + HYST*3
        || angle >= EXTENDED   - HYST*3;

      if(shouldInit){
        const midPoint = (CONTRACTED + EXTENDED) / 2;
        if(!isPress && !isInvert){
          // Normal: high angle = extended (up), low angle = contracted (down)
          c.phase = angle >= midPoint ? 'up' : 'down';
        } else if(isPress){
          // Press: low = arms at sides (down), high = overhead (up completed → down ready)
          c.phase = angle >= midPoint ? 'up' : 'down';
        } else {
          // Invert (curl, sit-up): high angle = extended (down), low = contracted (up)
          c.phase = angle >= midPoint ? 'down' : 'up';
        }
        c.peakAngle=angle; c.valleyAngle=angle;
      }
      setFeedback('Get into the starting position.','hi');
      updateFormScore(ex, angle, lms);
      const rc=el('rep-count'); if(rc) rc.textContent=Math.floor(c.reps);
      return;
    }

    // 6. Main phase state machine with range-of-motion guard.
    //    A rep only counts if the joint travelled MIN_RANGE degrees during the rep.
    // Phones observe shrunken range (smoothing + sparse frames), so they get
    // a forgiving guard; PC keeps the strict one. Shallow half-reps still fail.
    const MIN_RANGE = isPress ? (mob ? 32 : 45) : (mob ? 14 : 20); // shoulder press needs bigger range

    if(!isInvert && !isPress){
      // Normal exercises: phase 'up' = extended, phase 'down' = contracted.
      if(c.phase==='up'){
        c.valleyAngle = Math.min(c.valleyAngle, angle); // track how low we went
        if(angle <= CONTRACTED + HYST){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='down';
            c.peakAngle=angle; c.valleyAngle=angle; c.smoothAngle=null;
            setFeedback('Good depth — drive back up!','med');
          } else {
            setFeedback('Go lower — more range of motion.','med');
          }
        } else {
          setFeedback('Lower with control.','hi');
        }
      } else { // phase === 'down'
        c.peakAngle = Math.max(c.peakAngle, angle); // track how high we got
        if(angle >= EXTENDED - HYST){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='up';
            c.peakAngle=angle; c.valleyAngle=angle;
            completeRep(ex);
          } else {
            setFeedback('Extend fully at the top.','med');
          }
        } else {
          setFeedback('Push through — extend fully.','hi');
        }
      }
    } else if(isPress){
      // Shoulder press: phase 'down' = arms at sides (low angle), phase 'up' = overhead (high angle).
      // Flip rule is absolute OR relative: a 30°+ rise from this rep's valley
      // (or 30°+ drop from its peak) counts as the transition. Front phone
      // cameras geometrically under-read both extremes, so absolute-only lines
      // calibrated on PC side-views strand phone users mid-set forever.
      // The MIN_RANGE guard still applies, so jitter/small wiggles can't count.
      const PRESS_REL = 30;
      if(c.phase==='down'){
        c.peakAngle = Math.max(c.peakAngle, angle);
        if(angle >= EXTENDED - HYST || (c.valleyAngle!=null && angle >= c.valleyAngle + PRESS_REL)){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='up';
            c.peakAngle=angle; c.valleyAngle=angle;
            completeRep(ex);
          } else {
            setFeedback('Press higher — full extension overhead.','med');
          }
        } else {
          setFeedback('Press arms all the way overhead.','hi');
        }
      } else { // phase === 'up'
        c.valleyAngle = Math.min(c.valleyAngle, angle);
        if(angle <= CONTRACTED + HYST || (c.peakAngle!=null && angle <= c.peakAngle - PRESS_REL)){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='down';
            c.peakAngle=angle; c.valleyAngle=angle; c.smoothAngle=null;
            setFeedback('Good — press overhead again!','med');
          } else {
            setFeedback('Lower arms fully before pressing again.','med');
          }
        } else {
          setFeedback('Lower arms to starting position.','hi');
        }
      }
    } else {
      // Inverted exercises (curl, sit-up): phase 'up' = contracted (low angle), 'down' = extended (high).
      if(c.phase==='up'){
        c.peakAngle = Math.max(c.peakAngle, angle);
        if(angle >= EXTENDED - HYST){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='down';
            c.peakAngle=angle; c.valleyAngle=angle;
            completeRep(ex);
          } else {
            setFeedback('Release further — full extension.','med');
          }
        } else {
          setFeedback('Lower slowly — feel the stretch.','hi');
        }
      } else { // phase === 'down' (extended) — wait for contraction past mid-range
        c.valleyAngle = Math.min(c.valleyAngle, angle);
        const midThresh = (CONTRACTED + EXTENDED) / 2;
        if(angle <= midThresh){
          const range = c.peakAngle - c.valleyAngle;
          if(range >= MIN_RANGE){
            c.phase='up';
            c.peakAngle=angle; c.valleyAngle=angle; c.smoothAngle=null;
            setFeedback('Nice contraction — release slowly.','med');
          } else {
            setFeedback('Curl / lift higher for full rep.','med');
          }
        } else {
          setFeedback('Curl / lift with control.','hi');
        }
      }
    }

    updateFormScore(ex, angle, lms);
  }
  else if(ex.engine==='jack'){
    const lw=lms[LM.LWR], rw=lms[LM.RWR], la=lms[LM.LANK], ra=lms[LM.RANK], lsh=lms[LM.LSH];
    if(!lw||!rw||!la||!ra||!lsh){ setFeedback('Stand fully in frame.','lo'); return; }
    const armSpread = Math.hypot((lw.x-rw.x),(lw.y-rw.y));
    const legSpread = Math.hypot((la.x-ra.x),(la.y-ra.y));
    const openState = armSpread>0.35 && legSpread>0.22;
    if(c.phase==='closed' && openState){ c.phase='open'; setFeedback('Arms up, legs wide — nice!','med'); }
    else if(c.phase==='open' && !openState){ c.phase='closed'; completeRep(ex); }
    else if(c.phase==='neutral'){ c.phase='closed'; }
    else setFeedback(c.phase==='open'?'Bring arms and legs back in.':'Jump — arms up, legs wide.','hi');
    updateFormScore(ex, openState?170:20, lms);
  }
  else if(ex.engine==='hold'){
    const sh=lms[LM.LSH], hip=lms[LM.LHIP], ank=lms[LM.LANK];
    if(!sh||!hip||!ank){ setFeedback('Get your full body in frame, side-on to camera.','lo'); return; }
    const straightAngle = angleBetween(sh,hip,ank);
    const aligned = straightAngle>155;
    if(aligned){
      c.holdSeconds += 1/30;
      setFeedback('Great hold — keep that straight line!','hi');
    } else {
      setFeedback(straightAngle<155? 'Raise your hips slightly — avoid sagging.':'Lower your hips slightly.','med');
    }
    updateFormScore(ex, straightAngle, lms);
    const rc=el('rep-count'); if(rc) rc.textContent=formatTime(c.holdSeconds);
    if(c.holdSeconds>=ex.reps){ completeSet(ex); c.holdSeconds=0; }
    return;
  }
  else if(ex.engine==='yoga_tree'){
    const lank=lms[LM.LANK], rank=lms[LM.RANK], lhip=lms[LM.LHIP], rhip=lms[LM.RHIP];
    if(!lank||!rank||!lhip||!rhip){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const ankleDiff = Math.abs(lank.y - rank.y); // one foot lifted and placed against the standing leg
    const hipTilt = Math.abs(lhip.y - rhip.y);   // level hips = steadier balance
    const lifted = ankleDiff > 0.12;
    const balanced = hipTilt < 0.05;
    if(lifted && balanced){
      c.holdSeconds += 1/30;
      setFeedback('Steady tree — beautiful balance!','hi');
    } else if(!lifted){
      setFeedback('Lift one foot and rest it against your standing leg.','med');
    } else {
      setFeedback('Keep your hips level — engage your core to steady the balance.','med');
    }
    updateFormScore(ex, balanced?170:100, lms);
    const rc=el('rep-count'); if(rc) rc.textContent=formatTime(c.holdSeconds);
    if(c.holdSeconds>=ex.reps){ completeSet(ex); c.holdSeconds=0; }
    return;
  }
  else if(ex.engine==='yoga_warrior2'){
    const lk=jointAngle(lms,'knee','L'), rk=jointAngle(lms,'knee','R');
    const lw=lms[LM.LWR], rw=lms[LM.RWR], lsh=lms[LM.LSH], rsh=lms[LM.RSH];
    if((lk===null&&rk===null)||!lw||!rw||!lsh||!rsh){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const frontKnee = (lk!==null && (rk===null || lk<rk)) ? lk : rk;
    const kneeBent = frontKnee!==null && frontKnee>85 && frontKnee<135;
    const armSpread = Math.hypot(lw.x-rw.x, lw.y-rw.y);
    const armsWide = armSpread > 0.38;
    const armsLevel = Math.abs(((lw.y+rw.y)/2) - ((lsh.y+rsh.y)/2)) < 0.10;
    if(kneeBent && armsWide && armsLevel){
      c.holdSeconds += 1/30;
      setFeedback('Strong Warrior II — hold it!','hi');
    } else if(!kneeBent){
      setFeedback('Bend your front knee to about 90 degrees.','med');
    } else {
      setFeedback('Extend both arms out to shoulder height.','med');
    }
    updateFormScore(ex, frontKnee||90, lms);
    const rc=el('rep-count'); if(rc) rc.textContent=formatTime(c.holdSeconds);
    if(c.holdSeconds>=ex.reps){ completeSet(ex); c.holdSeconds=0; }
    return;
  }
  else if(ex.engine==='yoga_chair'){
    const lk=jointAngle(lms,'knee','L'), rk=jointAngle(lms,'knee','R');
    const lse=jointAngle(lms,'shoulder_elev','L'), rse=jointAngle(lms,'shoulder_elev','R');
    if(lk===null&&rk===null){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const kneeVals=[lk,rk].filter(v=>v!==null);
    const kneeAvg = kneeVals.reduce((a,b)=>a+b,0)/kneeVals.length;
    const seatDown = kneeAvg>90 && kneeAvg<150;
    const armsUp = (lse!==null && lse>130) || (rse!==null && rse>130);
    if(seatDown && armsUp){
      c.holdSeconds += 1/30;
      setFeedback('Great Chair Pose — sit lower, reach higher!','hi');
    } else if(!seatDown){
      setFeedback('Bend your knees like sitting into a chair.','med');
    } else {
      setFeedback('Reach both arms straight overhead.','med');
    }
    updateFormScore(ex, kneeAvg, lms);
    const rc=el('rep-count'); if(rc) rc.textContent=formatTime(c.holdSeconds);
    if(c.holdSeconds>=ex.reps){ completeSet(ex); c.holdSeconds=0; }
    return;
  }
  else if(ex.engine==='yoga_mountain'){
    const kn=yogaAvg([jointAngle(lms,'knee','L'),jointAngle(lms,'knee','R')]);
    const arm=yogaMax([jointAngle(lms,'shoulder_elev','L'),jointAngle(lms,'shoulder_elev','R')]);
    const lank=lms[LM.LANK], rank=lms[LM.RANK], lhip=lms[LM.LHIP], rhip=lms[LM.RHIP], lsh=lms[LM.LSH], rsh=lms[LM.RSH];
    if(kn===null||!lank||!rank||!lhip||!rhip||!lsh||!rsh){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const hipW = Math.abs(lhip.x-rhip.x) || 0.1;
    const legsOk = kn>165, feetOk = Math.abs(lank.x-rank.x) < hipW*1.8;
    const armsOk = arm===null || arm<45, shOk = Math.abs(lsh.y-rsh.y) < 0.04;
    const fix = !legsOk?'Straighten your legs and press your feet into the floor.'
      : !feetOk?'Bring your feet closer together.'
      : !armsOk?'Let your arms rest by your sides.'
      : 'Level your shoulders — relax them down.';
    yogaTick(ex, legsOk&&feetOk&&armsOk&&shOk, 'Steady Mountain — stand tall and breathe!', fix, lms);
    return;
  }
  else if(ex.engine==='yoga_upward_salute'){
    const kn=yogaAvg([jointAngle(lms,'knee','L'),jointAngle(lms,'knee','R')]);
    const arm=yogaMin([jointAngle(lms,'shoulder_elev','L'),jointAngle(lms,'shoulder_elev','R')]);
    if(kn===null){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const armsOk = arm!==null && arm>140, legsOk = kn>165;
    yogaTick(ex, armsOk&&legsOk, 'Reach tall — beautiful Upward Salute!',
      !armsOk?'Reach both arms straight overhead.':'Straighten your legs and lengthen up.', lms);
    return;
  }
  else if(ex.engine==='yoga_warrior1'){
    const lk=jointAngle(lms,'knee','L'), rk=jointAngle(lms,'knee','R');
    const arm=yogaMin([jointAngle(lms,'shoulder_elev','L'),jointAngle(lms,'shoulder_elev','R')]);
    if(lk===null||rk===null){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const front=Math.min(lk,rk), back=Math.max(lk,rk);
    const frontOk = front>85 && front<135, backOk = back>155, armsOk = arm!==null && arm>135;
    yogaTick(ex, frontOk&&backOk&&armsOk, 'Strong Warrior I — hold it!',
      !frontOk?'Bend your front knee to about 90 degrees.':!backOk?'Straighten your back leg.':'Reach both arms overhead.', lms);
    return;
  }
  else if(ex.engine==='yoga_goddess'){
    const kn=yogaAvg([jointAngle(lms,'knee','L'),jointAngle(lms,'knee','R')]);
    const lank=lms[LM.LANK], rank=lms[LM.RANK], lhip=lms[LM.LHIP], rhip=lms[LM.RHIP];
    const lw=lms[LM.LWR], rw=lms[LM.RWR], le=lms[LM.LEL], re=lms[LM.REL];
    if(kn===null||!lank||!rank||!lhip||!rhip||!lw||!rw||!le||!re){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const hipW = Math.abs(lhip.x-rhip.x) || 0.1;
    const wideOk = Math.abs(lank.x-rank.x) > hipW*2.2, kneesOk = kn>95 && kn<145;
    const armsOk = lw.y<le.y && rw.y<re.y; // hands above elbows = "cactus arms"
    yogaTick(ex, wideOk&&kneesOk&&armsOk, 'Powerful Goddess — sink and hold!',
      !wideOk?'Step your feet wide apart.':!kneesOk?'Bend your knees over your toes and sink your hips.':'Raise your hands with elbows bent, like a cactus.', lms);
    return;
  }
  else if(ex.engine==='yoga_triangle'){
    const kn=yogaAvg([jointAngle(lms,'knee','L'),jointAngle(lms,'knee','R')]);
    const lank=lms[LM.LANK], rank=lms[LM.RANK], lhip=lms[LM.LHIP], rhip=lms[LM.RHIP], lw=lms[LM.LWR], rw=lms[LM.RWR];
    if(kn===null||!lank||!rank||!lhip||!rhip||!lw||!rw){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const hipW = Math.abs(lhip.x-rhip.x) || 0.1;
    const wideOk = Math.abs(lank.x-rank.x) > hipW*2.2, legsOk = kn>160;
    const tiltOk = yogaTorsoTilt(lms) > 25, armsOk = Math.abs(lw.y-rw.y) > 0.22;
    yogaTick(ex, wideOk&&legsOk&&tiltOk&&armsOk, 'Nice Triangle — open your chest!',
      !wideOk?'Step your feet wide apart.':!legsOk?'Keep both legs straight.':!tiltOk?'Reach sideways and tilt your torso over one leg.':'Stack your arms — one hand down, one reaching up.', lms);
    return;
  }
  else if(ex.engine==='yoga_side_bend'){
    const kn=yogaAvg([jointAngle(lms,'knee','L'),jointAngle(lms,'knee','R')]);
    const arm=yogaMin([jointAngle(lms,'shoulder_elev','L'),jointAngle(lms,'shoulder_elev','R')]);
    if(kn===null){ setFeedback('Step back so your full body is in frame.','lo'); return; }
    const armsOk = arm!==null && arm>130, legsOk = kn>160, tiltOk = yogaTorsoTilt(lms) > 12;
    yogaTick(ex, armsOk&&legsOk&&tiltOk, 'Lovely side stretch — breathe into it.',
      !armsOk?'Reach both arms overhead.':!legsOk?'Keep your legs straight.':'Lean gently to one side — keep your hips still.', lms);
    return;
  }
  else if(ex.engine==='yoga_prayer'){
    const lw=lms[LM.LWR], rw=lms[LM.RWR], lsh=lms[LM.LSH], rsh=lms[LM.RSH], lh=lms[LM.LHIP], rh=lms[LM.RHIP];
    if(!lw||!rw||!lsh||!rsh||!lh||!rh){ setFeedback('Step back so your upper body is in frame.','lo'); return; }
    const shW = Math.abs(lsh.x-rsh.x) || 0.2;
    const gapOk = Math.hypot(lw.x-rw.x, lw.y-rw.y) < shW*0.45;
    const sy=(lsh.y+rsh.y)/2, hy=(lh.y+rh.y)/2, wy=(lw.y+rw.y)/2;
    const chestOk = wy>sy && wy < sy + (hy-sy)*0.7;
    yogaTick(ex, gapOk&&chestOk, 'Peaceful Namaste — breathe deeply.',
      !gapOk?'Bring your palms together at your chest.':'Bring your hands to heart level.', lms);
    return;
  }
  else if(ex.engine==='alternate'){
    const lh=jointAngle(lms,'hip','L'), rh=jointAngle(lms,'hip','R');
    if(lh===null && rh===null){ setFeedback('Move into full view of the camera.','lo'); return; }
    const thresh = 110;
    if(lh!==null){
      if(c.altState.left==='up' && lh<thresh){ c.altState.left='down'; }
      else if(c.altState.left==='down' && lh>thresh+15){ c.altState.left='up'; completeRep(ex,0.5); }
    }
    if(rh!==null){
      if(c.altState.right==='up' && rh<thresh){ c.altState.right='down'; }
      else if(c.altState.right==='down' && rh>thresh+15){ c.altState.right='up'; completeRep(ex,0.5); }
    }
    setFeedback('Drive knees up alternately, stay light on your feet.','hi');
    updateFormScore(ex, Math.min(lh??180,rh??180), lms);
  }

  const rc=el('rep-count'); if(rc && !isHoldEx(ex)) rc.textContent=Math.floor(c.reps + 1e-6);
}

function completeRep(ex, fraction){
  const c=state.coach;
  // Keep fractional reps (0.5 per side for alternate engines) as float.
  // Round only for display / completion checks so left+right = 1 rep.
  c.reps += (fraction||1);
  // Fresh angle tracking for the next rep: the EMA converges during a rep
  // and on slow phones lags behind real motion, freezing the counter after
  // rep 1. Re-init from raw (same as session start, which always works).
  c.smoothAngle = null;
  const displayReps = Math.floor(c.reps + 1e-6);
  const rc=el('rep-count');
  if(rc){ rc.textContent=displayReps; rc.classList.remove('pulse'); void rc.offsetWidth; rc.classList.add('pulse'); }
  syncLiveStats();
  addXp10Silent();
  state.totalReps += 1;
  state.totalCalories += ex.kcalPerRep||0.2;
  c.sessionCalories = (c.sessionCalories||0) + (ex.kcalPerRep||0.2);
  const calEl=el('stat-cal'); if(calEl) calEl.textContent=Math.round(c.sessionCalories);
  if(state.totalReps>=100) unlockBadge('rep100');
  if(displayReps>=ex.reps){ completeSet(ex); }
}
function completeSet(ex){
  const c=state.coach;
  toast(`<b>Set ${c.sets} complete!</b><br>${ex.name} — nice work.`);
  if(c.sets<c.setTarget){ c.sets++; c.reps=0; c.holdSeconds=0; }
  else { finishWorkoutSession(); }
}
function addXp10Silent(){
  // quieter XP gain per rep (no toast spam)
  state.xp += 2;
  refreshChrome();
}
function updateFormScore(ex, primaryVal, lms){
  // Throttled (see hudDue): score math + DOM writes every frame would
  // saturate phone CPUs. 2.5Hz is plenty for a displayed score.
  if(!hudDue('form',400)) return;
  // Deterministic heuristic composite score (no randomness, stable across runs)
  const torsoTilt = (()=>{
    const sh=lms[LM.LSH], hip=lms[LM.LHIP];
    if(!sh||!hip) return 90;
    return Math.abs(Math.atan2(sh.x-hip.x, hip.y-sh.y)*180/Math.PI);
  })();
  const posture = clamp(100-torsoTilt*2,40,100);
  const align = clamp(100-Math.abs(90-((primaryVal||90)%180))*0.4,50,100);
  // Depth/range: blend of posture+alignment (deterministic). Higher when both are good.
  const depth = clamp(Math.round(70 + (posture-70)*0.35 + (align-70)*0.35),50,100);
  const score = Math.round((posture*0.4+align*0.35+depth*0.25));
  state.coach.formScore=score;
  // Throttle history pushes: max 1 per 500ms so 30fps doesn't flood the average
  const now = Date.now();
  if(!state.coach.lastFormPush || (now - state.coach.lastFormPush) > 500){
    state.formScores.push(score);
    if(state.formScores.length>50) state.formScores.shift();
    state.coach.lastFormPush = now;
  }
  if(score>=95) unlockBadge('perfect');
  const circ = el('score-circle');
  if(circ){
    const R=46, C=2*Math.PI*R;
    circ.setAttribute('stroke-dashoffset', C - (score/100)*C);
  }
  const sn=el('score-num'); if(sn) sn.textContent=score;
  const bp=el('bd-posture'); if(bp) bp.textContent=Math.round(posture);
  const ba=el('bd-align'); if(ba) ba.textContent=Math.round(align);
  const bd=el('bd-depth'); if(bd) bd.textContent=Math.round(depth);
  // Keep Live Stats form % tile current
  const lf2=el('ls-form'); if(lf2) lf2.textContent=score;
}

function finishWorkoutSession(){
  const c=state.coach;
  const ex = EXERCISES.find(e=>e.id===c.selectedExercise);
  stopCamera();
  state.workoutsCompleted += 1;
  if(state.workoutsCompleted===1) unlockBadge('first');
  markStreakToday();
  const xpEarned = 50 + Math.round((state.coach.formScore||80)/2);
  addXp(xpEarned, `Completed ${ex?ex.name:'workout'} session`);
  // bump relevant challenges
  const completedReps = Math.floor(c.reps||0);
  const sessionCal = Math.round(c.sessionCalories||((state.totalCalories||0)-(c.sessionStartCalories||0)));
  state.challenges.forEach(ch=>{
    if(ch.id==='sq7' && ex?.id==='squat') ch.progress=Math.min(ch.target,ch.progress+1);
    if(ch.id==='pu100' && ex?.id==='pushup') ch.progress=Math.min(ch.target,ch.progress+completedReps);
    if(ch.id==='daily10') ch.progress=Math.min(ch.target,ch.progress+1);
    if(ch.id==='fit30') ch.progress=Math.min(ch.target,ch.progress+1);
    if(ch.id==='college') ch.progress=Math.min(ch.target,ch.progress+1);
    if(ch.progress>=ch.target) unlockBadge('challenge');
  });
  const today = new Date().toISOString().slice(0,10);
  let day = state.history.find(h=>h.date===today);
  if(!day){ day={date:today,workouts:0,reps:0,xp:0,calories:0,formScore:0}; state.history.push(day); }
  day.workouts+=1; day.reps+=completedReps; day.xp+=xpEarned; day.calories+=sessionCal; day.formScore=c.formScore;
  apiSyncWorkout({exercise_id:ex?.id||'', exercise_name:ex?.name||'workout', reps:completedReps, sets:c.sets||1, xp_earned:xpEarned, calories:sessionCal, form_score:c.formScore||0, seconds:c.seconds||0, date:today});

  toast(`<b>Workout Completed! 🎉</b><br>${ex && ex.engine==='hold' ? formatTime(c.holdSeconds||0)+' hold' : completedReps+' reps'} · ${xpEarned} XP earned`);
  state.coach.selectedExercise=null;
  state.coach.reps=0; state.coach.sets=1; state.coach.holdSeconds=0;
  state.coach.sessionCalories=0; state.coach.sessionStartCalories=state.totalCalories||0;
  saveStateToStorage(); // Auto-save completed workout
  setView('dashboard');
}
function markStreakToday(){
  const i=todayIdx();
  state.streakDays[i]='done'; // legacy compat flag
  state.streak = calcLoginStreak();
  if(state.streak>=7) unlockBadge('streak7');
}

/* ================= NUTRITION ================= */
let foodSearchQ='';
function renderNutrition(){
  const n=state.nutrition;
  const totals = n.log.reduce((a,f)=>({kcal:a.kcal+f.kcal,p:a.p+f.p,c:a.c+f.c,f:a.f+f.f}),{kcal:0,p:0,c:0,f:0});
  const meals=['Breakfast','Lunch','Snack','Dinner'];
  el('view-nutrition').innerHTML = `
    <div class="pagehead"><div><h1 class="display">Nutrition AI</h1><p>Snap, search, or log your meals to track daily nutrition.</p></div></div>
    <div class="macro-grid">
      ${macroCard('Calories',totals.kcal,n.calGoal,'kcal','#d4ff3f')}
      ${macroCard('Protein',totals.p,n.pGoal,'g','#4fc3f7')}
      ${macroCard('Carbs',totals.c,n.cGoal,'g','#ff5d5d')}
      ${macroCard('Fat',totals.f,n.fGoal,'g','#b48cff')}
    </div>

    <div class="two-col mt">
      <div class="card">
        <div class="card-title">Log a Meal</div>
        <div class="upload-drop" id="upload-drop">
          <div style="font-size:28px;">📷</div>
          <div style="margin:8px 0 12px 0;">Snap your meal or upload a photo<br><span class="small-muted">AI vision estimates the dish when the backend is running, otherwise a demo guess is shown.</span></div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-volt btn-sm" onclick="foodTakePhoto()">📷 Take Photo</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('food-photo').click()">🖼 Upload</button>
          </div>
        </div>
        <input type="file" id="food-camera" accept="image/*" capture="environment" class="hidden" onchange="handleFoodPhoto(event)">
        <input type="file" id="food-photo" accept="image/*" class="hidden" onchange="handleFoodPhoto(event)">
        <div id="food-cam-panel" class="hidden" style="margin-top:12px;">
          <div style="border-radius:var(--radius-m);overflow:hidden;background:#000;border:1px solid var(--line);">
            <video id="food-cam-video" autoplay playsinline muted style="width:100%;display:block;max-height:320px;object-fit:contain;background:#000;"></video>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button class="btn btn-volt btn-sm" onclick="captureFoodPhoto()">📸 Capture</button>
            <button class="btn btn-ghost btn-sm" onclick="stopFoodCam()">Cancel</button>
          </div>
        </div>
        <div id="recognized-holder"></div>
        <div class="food-search-wrap mt">
          <input class="search-box" style="width:100%" placeholder="Or search a food item (e.g. Roti, Dal, Idli)..." value="${esc(foodSearchQ)}" oninput="foodSearchQ=this.value;renderFoodSuggest();" onfocus="renderFoodSuggest();">
          <div id="food-suggest"></div>
        </div>
        <div class="disclaimer">Nutrition values are estimates and may vary depending on portion size, ingredients and cooking method. A production build would use a verified nutrition database and a trained food-recognition model.</div>
      </div>

      <div class="card">
        <div class="card-title">Today's Meals</div>
        ${meals.map(m=>{
          const items=n.log.filter(f=>f.meal===m);
          return `<div class="meal-block"><h4>${m}</h4>${items.length? items.map((f,idx)=>`<div class="meal-item"><span>${f.name}</span><span>${f.kcal} kcal · ${f.p}p / ${f.c}c / ${f.f}f</span></div>`).join('') : '<div class="small-muted">No items logged yet.</div>'}</div>`;
        }).join('')}
      </div>
    </div>`;
}
function macroCard(label,val,goal,unit,color){
  const pct=clamp(Math.round(val/goal*100),0,100);
  return `<div class="macro-card">
    <div class="top"><span>${label}</span><span>${Math.round(val)} / ${goal} ${unit}</span></div>
    <div class="macro-bar"><i style="width:${pct}%;background:${color}"></i></div>
    <div class="amt display">${Math.round(val)}</div>
  </div>`;
}
function renderFoodSuggest(){
  const holder = el('food-suggest');
  if(!holder) return;
  if(!foodSearchQ){ holder.innerHTML=''; return; }
  const matches = FOODS.filter(f=>f.n.toLowerCase().includes(foodSearchQ.toLowerCase())).slice(0,8);
  if(!matches.length){ holder.innerHTML=`<div class="food-suggest"><div class="opt small-muted">No matches found.</div></div>`; return; }
  holder.innerHTML = `<div class="food-suggest">${matches.map(f=>`<div class="opt" data-food="${esc(f.n)}" onclick="selectFood(this.dataset.food)"><span>${f.ic} ${esc(f.n)}</span><span class="small-muted">${f.kcal} kcal</span></div>`).join('')}</div>`;
}
function selectFood(name){
  const f = FOODS.find(x=>x.n===name);
  if(!f) return;
  el('food-suggest').innerHTML='';
  foodSearchQ='';
  showRecognized(f, 'Search match');
}
function matchFoodIcon(name){
  const n = String(name||'').toLowerCase();
  const hit = FOODS.find(f=>n.includes(f.n.toLowerCase()) || f.n.toLowerCase().includes(n));
  return hit ? hit.ic : '🍽️';
}
async function handleFoodPhoto(evt){
  // Photo arrived in the live page (no OS kill) — clear the return flag.
  try{ sessionStorage.removeItem('fitquest_food_return'); }catch(e){}
  const file = evt.target.files[0];
  if(!file) return;
  evt.target.value = ''; // allow re-uploading the same photo
  analyzeFoodFile(file);
}
/* HEIC/HEIF (iPhone default) can't be decoded by browsers — detect by MIME
   or extension (some phones send an empty MIME type) so we can convert. */
function isHeicFile(file){
  if(!file) return false;
  if(/heic|heif/i.test(file.type||'')) return true;
  return /\.hei[cf]$/i.test(file.name||'');
}
/* heic2any loads on demand (first HEIC only) so its WASM never costs memory
   for JPEG/PNG users. */
function loadHeic2Any(){
  return new Promise(resolve=>{
    if(typeof heic2any!=='undefined'){ resolve(true); return; }
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.crossOrigin='anonymous';
    s.onload=()=>resolve(typeof heic2any!=='undefined');
    s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  });
}
/* Legacy full-decode fallback (only when createImageBitmap is missing).
   Decodes the whole image before shrinking — fine on PC, risky on weak phones. */
function decodeFoodFull(file, resolve){
  try{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      try{
        const MAX = 1280;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        if(scale >= 1){ URL.revokeObjectURL(url); resolve(file); return; }
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width*scale); cv.height = Math.round(img.height*scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b=>resolve(b || file), 'image/jpeg', 0.82);
      }catch(e){ URL.revokeObjectURL(url); resolve(file); }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  }catch(e){ resolve(file); }
}
function downscaleFoodImage(file){
  // iPhone HEIC first: convert on-device to JPEG, then run the normal
  // pipeline on the result. JPEG/PNG/WebP/GIF/BMP/AVIF already decode
  // natively in browsers, so HEIC was the only unsupported format.
  if(isHeicFile(file)){
    return new Promise(resolve=>{
      toast('<b>Converting iPhone photo…</b><br>One moment.');
      loadHeic2Any().then(ok=>{
        if(!ok || typeof heic2any==='undefined'){
          toast('<b>Photo converter still loading</b><br>Check connection and retry in a few seconds.');
          resolve(null); return;
        }
        heic2any({blob:file, toType:'image/jpeg', quality:0.85}).then(out=>{
          const b = Array.isArray(out) ? out[0] : out;
          try{ downscaleFoodImage(new File([b],'meal.jpg',{type:'image/jpeg'})).then(resolve); }
          catch(e){ resolve(null); }
        }).catch(()=>{
          toast('<b>Could not read this photo</b><br>Try sending it as JPEG (Photos → Share → Save as JPEG) and retry.');
          resolve(null);
        });
      });
    });
  }
  return new Promise(resolve=>{
    try{
      if(!file || !file.type || file.type.indexOf('image/')!==0){ resolve(file); return; }
      if(file.size < 900*1024){ resolve(file); return; }
      // Memory-safe decode: shrink DURING decode so a 12MP phone photo never
      // sits in RAM as a full bitmap plus a full canvas plus a blob. The old
      // full-decode-then-shrink path OOM-crashes weak-phone renderers right
      // after tapping ✓ — Chrome then auto-reloads the tab, which looks like
      // a "refresh" and loses the image. Two-step (dims → close → resized
      // decode) so only one small bitmap exists at a time. Falls back below.
      if(typeof createImageBitmap==='function'){
        createImageBitmap(file).then(bmp=>{
          try{
            const MAXB = 1280;
            const bw = bmp.width||1, bh = bmp.height||1;
            const scale = Math.min(1, MAXB / Math.max(bw, bh));
            const w = Math.max(1, Math.round(bw*scale));
            const h = Math.max(1, Math.round(bh*scale));
            try{ if(bmp.close) bmp.close(); }catch(e){}
            if(scale >= 1){ resolve(file); return; }
            createImageBitmap(file, {resizeWidth:w, resizeHeight:h, resizeQuality:'high'}).then(small=>{
              try{
                const cv = document.createElement('canvas');
                cv.width=w; cv.height=h;
                cv.getContext('2d').drawImage(small, 0, 0, w, h);
                try{ if(small.close) small.close(); }catch(e){}
                cv.toBlob(b=>resolve(b || file), 'image/jpeg', 0.82);
              }catch(e){ try{ if(small.close) small.close(); }catch(e2){} resolve(file); }
            }).catch(()=>{ decodeFoodFull(file, resolve); });
          }catch(e){ try{ if(bmp.close) bmp.close(); }catch(e2){} resolve(file); }
        }).catch(()=>{ decodeFoodFull(file, resolve); });
        return;
      }
      decodeFoodFull(file, resolve);
    }catch(e){ resolve(file); }
  }).then(f=>{
    if(f && f !== file && !f.name){
      try{ return new File([f], 'meal.jpg', {type:'image/jpeg'}); }catch(e){ return f; }
    }
    return f;
  });
}
/* Take Photo routing: ALWAYS the integrated in-browser preview (all devices).
   The native camera app backgrounds the tab — Android then kills it under
   memory pressure and restores with a full reload, losing the photo. The
   in-page preview never leaves the page, so no refresh is possible. */
function foodTakePhoto(){
  openFoodCamera();
}
function stopFoodCam(){
  try{ if(window._foodStream){ window._foodStream.getTracks().forEach(t=>t.stop()); window._foodStream=null; } }catch(e){}
  const v=el('food-cam-video'); if(v) v.srcObject=null;
  const p=el('food-cam-panel'); if(p) p.classList.add('hidden');
}
async function openFoodCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    document.getElementById('food-photo').click(); // insecure context -> file picker
    return;
  }
  const panel=el('food-cam-panel'); if(!panel){ document.getElementById('food-photo').click(); return; }
  panel.classList.remove('hidden');
  try{
    stopFoodCam();
    panel.classList.remove('hidden');
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'environment'},audio:false});
    window._foodStream=stream;
    const video=el('food-cam-video');
    video.srcObject=stream;
    try{ await video.play(); }catch(e){}
  }catch(e){
    stopFoodCam();
    toast('<b>Camera blocked</b><br>Allow camera access and retry, or use Upload instead.');
  }
}
async function captureFoodPhoto(){
  const video=el('food-cam-video');
  if(!video || !video.videoWidth){ toast('<b>Camera not ready</b><br>Wait a second and try again.'); return; }
  const cv=document.createElement('canvas');
  cv.width=video.videoWidth; cv.height=video.videoHeight;
  cv.getContext('2d').drawImage(video,0,0,cv.width,cv.height);
  const blob=await new Promise(r=>{ try{ cv.toBlob(r,'image/jpeg',0.85); }catch(e){ r(null); } });
  stopFoodCam();
  if(!blob){ toast('<b>Capture failed</b><br>Try again or use Upload.'); return; }
  analyzeFoodFile(new File([blob],'meal.jpg',{type:'image/jpeg'}));
}
async function analyzeFoodFile(file){
  if(!file) return;
  // Shrink huge phone photos first: faster upload, no 413 rejections, and
  // small vision models actually focus better at ~1280px than at 12MP.
  file = await downscaleFoodImage(file);
  if(!file) return;
  // Real AI path: backend forwards the photo to the NVIDIA vision model.
  // Requires backend running + login token. Falls back to simulation offline.
  if(apiAvailable()){
    el('recognized-holder').innerHTML = `
      <div class="recognized-card">
        <div class="thumb">🔍</div>
        <div style="flex:1;"><div style="font-weight:700;">Analyzing photo…</div>
        <div class="small-muted">AI vision model is estimating this meal.</div></div>
      </div>`;
    try{
      const fd = new FormData();
      fd.append('file', file);
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 175000);
      const res = await fetch(API_BASE+'/api/nutrition/analyze-upload', {method:'POST', headers:{'Authorization':'Bearer '+apiToken()}, body:fd, signal:ctrl.signal});
      clearTimeout(timer);
      if(res.ok){
        const out = await res.json();
        const base = FOODS.find(f=>f.n.toLowerCase()===String(out.name||'').toLowerCase());
        const f = base ? {...base} : {n:out.name||'Meal', u:out.unit||'1 serving', kcal:out.kcal||0, p:out.protein_g||0, c:out.carbs_g||0, f:out.fat_g||0, ic:matchFoodIcon(out.name)};
        if(!base){ f.kcal = out.kcal||0; f.p = out.protein_g||0; f.c = out.carbs_g||0; f.f = out.fat_g||0; f.u = out.unit||'1 serving'; }
        showRecognized(f, `AI Detected · ${out.confidence||''}% confidence`);
        return;
      }
      if(res.status===422){
        el('recognized-holder').innerHTML = `
          <div class="recognized-card" style="border-color:var(--coral);">
            <div class="thumb">🚫</div>
            <div style="flex:1;"><div style="font-weight:700;">Not a food item</div>
            <div class="small-muted">Please retake a photo of your meal.</div></div>
          </div>
          <button class="btn btn-volt btn-block mt" onclick="foodTakePhoto()">📷 Retake Photo</button>`;
        return;
      }
      if(res.status===503){ toast('<b>AI not configured</b><br>Set NVIDIA_API_KEY on the server. Using simulation.'); }
      if(res.status===401){
        // Stale/dead token (e.g. server DB was reset) — drop it so we don't
        // keep failing, and tell the user how to re-enable AI.
        apiSetToken(null);
        toast('<b>Backend session expired</b><br>Log out and log back in (backend running), then retry. Using simulation for now.');
      }
    }catch(e){ /* network/timeout -> simulation below */ }
  }
  // Simulated recognition fallback (offline / no token)
  const guess = pick(FOODS);
  const confidence = Math.round(rand(72,95));
  showRecognized(guess, `AI Detected (simulated) · ${confidence}% confidence`);
}
function showRecognized(f, tag){
  window._pendingFood = f;
  el('recognized-holder').innerHTML = `
    <div class="recognized-card">
      <div class="thumb">${f.ic}</div>
      <div style="flex:1;">
        <div style="font-weight:700;">${esc(f.n)}</div>
        <div class="small-muted">${esc(tag)} · ${esc(f.u)}</div>
        <div class="small-muted">${f.kcal} kcal · ${f.p}p / ${f.c}c / ${f.f}f</div>
      </div>
    </div>
    <div class="row2 mt">
      <div class="field"><label>Meal</label><select id="rc-meal"><option>Breakfast</option><option>Lunch</option><option>Snack</option><option>Dinner</option></select></div>
      <div class="field"><label>Quantity (×)</label><input id="rc-qty" type="number" value="1" min="0.25" step="0.25"></div>
    </div>
    <button class="btn btn-volt btn-block" onclick="confirmFoodPending()">Add to Log</button>`;
}
function confirmFoodPending(){
  if(window._pendingFood) confirmFood(window._pendingFood);
}
// Back-compat: older inline onclick passed the object directly
function confirmFood(f){
  const src = (f && f.n) ? f : window._pendingFood;
  if(!src) return;
  const meal = el('rc-meal').value;
  const qty = clamp(parseFloat(el('rc-qty').value)||1, 0.25, 10);
  state.nutrition.log.push({meal,name:src.n,kcal:Math.round(src.kcal*qty),p:+(src.p*qty).toFixed(1),c:+(src.c*qty).toFixed(1),f:+(src.f*qty).toFixed(1)});
  apiSyncMeal({meal,name:src.n,kcal:Math.round(src.kcal*qty),p:+(src.p*qty).toFixed(1),c:+(src.c*qty).toFixed(1),f:+(src.f*qty).toFixed(1),qty});
  toast(`<b>Logged</b><br>${esc(src.n)} added to ${esc(meal)}`);
  window._pendingFood = null;
  el('recognized-holder').innerHTML='';
  saveStateToStorage(); // Auto-save nutrition log
  renderNutrition();
}

/* ================= CHALLENGES ================= */
function renderChallenges(){
  el('view-challenges').innerHTML = `
    <div class="pagehead"><div><h1 class="display">Challenges</h1><p>Join a challenge and push your consistency.</p></div></div>
    <div class="chal-grid">
      ${state.challenges.map(c=>{
        const pct=Math.min(100,Math.round(c.progress/c.target*100));
        const done = c.progress>=c.target;
        return `<div class="chal-card">
          <div class="chal-top"><div class="chal-icon">${c.icon}</div>${done?'<span class="tag" style="color:var(--green)">Completed</span>':''}</div>
          <div style="font-weight:700;margin-top:8px;">${c.name}</div>
          <div class="small-muted">${c.desc}</div>
          <div class="chal-prog-outer"><div class="chal-prog-inner" style="width:${pct}%;background:${done?'var(--green)':'var(--blue)'}"></div></div>
          <div class="chal-foot">
            <span>${c.progress}/${c.target} ${c.unit}</span>
            <span>${c.participants} joined</span>
          </div>
          <div class="chal-foot"><span>Reward: ${c.xp} XP</span>
            ${done? '<span style="color:var(--green)">✓ Done</span>' : `<button class="btn btn-outline btn-sm" onclick="bumpChallenge('${c.id}')">Log Progress</button>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
function bumpChallenge(id){
  const c=state.challenges.find(x=>x.id===id);
  if(!c) return;
  c.progress=Math.min(c.target,c.progress+1);
  apiSyncChallenge(id);
  if(c.progress>=c.target){ unlockBadge('challenge'); addXp(c.xp,`Challenge complete: ${c.name}`); }
  else {
    toast(`<b>Progress logged</b><br>${c.name}: ${c.progress}/${c.target}`);
    saveStateToStorage();
  }
  renderChallenges();
}

/* ================= LEADERBOARD ================= */
let lbTab='Weekly';
function renderLeaderboard(){
  const me = {name:state.currentUser.name,xp:state.xp,level:levelForXp(state.xp)+1,workouts:state.workoutsCompleted,me:true};

  let all;
  const realOthers = state.users
    .filter(u => u.email !== state.currentUser.email)
    .map(u => ({
      name: u.name,
      xp: u.xp || 0,
      level: levelForXp(u.xp||0)+1,
      workouts: u.workoutsCompleted || 0,
    }));
  all = [...realOthers, me].sort((a,b)=>b.xp-a.xp);

  el('view-leaderboard').innerHTML = `
    <div class="pagehead"><div><h1 class="display">Leaderboard</h1><p>See how you stack up against other athletes.</p></div></div>
    <div class="lb-tabs">
      ${['Weekly','Monthly','College'].map(t=>`<button class="filter-chip ${t===lbTab?'on':''}" onclick="lbTab='${t}';renderLeaderboard();">${t}</button>`).join('')}
    </div>
    <div id="lb-server-note" class="small-muted" style="margin-bottom:10px;">${apiAvailable()?'Syncing with server…':'Local mode — start the backend to enable global rankings.'}</div>
    ${all.length === 1 ? `
      <div class="card" style="text-align:center;padding:40px 20px;">
        <div style="font-size:40px;margin-bottom:12px;">🏆</div>
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">You're the first athlete here!</div>
        <div class="small-muted">Invite friends to join FitQuest and compete together. The leaderboard fills up as more users sign up.</div>
      </div>` :
    all.map((u,i)=>`
      <div class="lb-row ${u.me?'me':''}">
        <div class="lb-rank ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
        <div class="avatar-sm">${initials(u.name)}</div>
        <div class="lb-name">${u.me?'You':esc(u.name)}<span>Level ${u.level} · ${u.workouts} workout${u.workouts!==1?'s':''}${u.college?' · '+u.college:''}</span></div>
        <div class="lb-xp">${u.xp} XP</div>
      </div>`).join('')}`;
  // Server enhancement: replace with global rankings when backend is reachable
  if(apiAvailable()){
    apiReq('/api/leaderboard').then(rows=>{
      if(!Array.isArray(rows) || !rows.length) return;
      const note = el('lb-server-note');
      if(note) note.textContent = 'Live global rankings · '+rows.length+' athletes';
      const main = el('view-leaderboard');
      if(!main) return;
      const listHtml = rows.map((u,i)=>`
      <div class="lb-row ${u.me?'me':''}">
        <div class="lb-rank ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
        <div class="avatar-sm">${initials(u.name)}</div>
        <div class="lb-name">${u.me?'You':esc(u.name)}<span>Level ${u.level} · ${u.workouts} workout${u.workouts!==1?'s':''}</span></div>
        <div class="lb-xp">${u.xp} XP</div>
      </div>`).join('');
      const tmp = document.createElement('div');
      tmp.innerHTML = listHtml;
      // remove old local rows, keep header + tabs + note
      main.querySelectorAll('.lb-row, .card').forEach(n=>n.remove());
      main.appendChild(tmp);
    }).catch(()=>{});
  }
}

/* ================= PROGRESS ================= */
let progRange=7;
let profRange=7;
function renderProgress(){
  const hist = state.history.slice(-progRange);
  const filled = hist.length? hist : [{date:'—',workouts:0,reps:0,xp:0,calories:0,formScore:0}];
  el('view-progress').innerHTML = `
    <div class="pagehead"><div><h1 class="display">Progress Analytics</h1><p>Track how you're trending over time.</p></div></div>
    <div class="range-tabs">
      ${[7,30,90].map(r=>`<button class="filter-chip ${r===progRange?'on':''}" onclick="progRange=${r};renderProgress();">${r} Days</button>`).join('')}
    </div>
    <div class="two-col">
      ${miniChart('Reps per Session','reps',filled,'#d4ff3f')}
      ${miniChart('XP Earned','xp',filled,'#4fc3f7')}
    </div>
    <div class="two-col mt">
      ${miniChart('Calories Burned','calories',filled,'#ff5d5d')}
      ${miniChart('Form Score','formScore',filled,'#3ddc97')}
    </div>`;
}
function miniChart(title,key,data,color){
  const max = Math.max(1,...data.map(d=>d[key]));
  const show = data.slice(-14);
  return `<div class="card chart-card">
    <div class="card-title">${title}</div>
    <div class="bars">${show.map(d=>{const h=Math.max(4,Math.round((d[key]/max)*120));return `<div class="b" style="height:${h}px;background:${color};opacity:.85"><i>${d[key]}</i></div>`;}).join('')}</div>
    <div class="bars-x">${show.map(d=>`<span>${d.date.slice(5)}</span>`).join('')}</div>
  </div>`;
}

/* ================= PROFILE ================= */
/* ================= XP STORE PAGE (full store lives here; Profile shows a 3-line category) ================= */
function renderXpStore(){
  el('view-xpstore').innerHTML = `
    <div class="pagehead"><div><h1 class="display">XP Store</h1><p>Spend XP Coins — never affects your Level.</p></div></div>
    <div class="card">
      <div class="card-title" style="font-size:14px;color:var(--volt-text);letter-spacing:0;text-transform:none;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>🪙 Balance</span>
        <span class="xp-balance-pill">🪙 ${coinBalance().toLocaleString()}${state.premium?'':` / ${FREE_XP_COIN_CAP.toLocaleString()}`} XP <span class="small-muted" style="font-weight:400;">≈ ₹${(coinBalance()/XP_COINS_PER_RUPEE).toFixed(2)}</span></span>
      </div>
      <p class="small-muted" style="margin:6px 0 14px;">500 XP Coins = ₹10 — spending here never affects your Level. ${state.premium
        ? 'As a Premium member you earn unlimited XP Coins and can redeem real fitness products.'
        : `Free accounts earn up to ${FREE_XP_COIN_CAP.toLocaleString()} spendable XP Coins and can redeem discount vouchers. <button onclick="setView('paywall')" style="color:var(--volt-text);font-weight:700;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;">Go Premium</button> to unlock unlimited coins and real product redemptions.`}</p>

      <div class="small-muted" style="font-weight:700;margin-bottom:8px;">🎟️ Discount Vouchers <span style="font-weight:400;">— free for everyone</span></div>
      <div class="xp-store-grid">
        ${XP_STORE_VOUCHERS.map(i=>{
          const cost = i.costXp;
          const afford = coinBalance()>=cost;
          return `
          <div class="xp-store-item">
            <div class="xp-store-icon">${i.icon}</div>
            <div class="xp-store-name">${esc(i.name)}</div>
            <div class="xp-store-desc">${esc(i.desc)}</div>
            <div class="xp-store-price">${cost.toLocaleString()} XP</div>
            <button class="btn btn-sm ${afford?'btn-volt':'btn-ghost'}" ${afford?'':'disabled'} onclick="redeemXpItem('${i.id}',false)">${afford?'Redeem':'Need '+(cost-coinBalance()).toLocaleString()+' more XP'}</button>
          </div>`;
        }).join('')}
      </div>

      <div class="small-muted" style="font-weight:700;margin:20px 0 8px;">🛍️ Real Fitness Products <span style="font-weight:400;">— Premium only</span></div>
      <div class="xp-store-grid">
        ${XP_STORE_PRODUCTS.map(i=>{
          const cost = i.costXp;
          const afford = state.premium && coinBalance()>=cost;
          return `
          <div class="xp-store-item ${state.premium?'':'locked'}">
            ${state.premium?'':'<div class="xp-store-lock">🔒</div>'}
            <div class="xp-store-icon">${i.icon}</div>
            <div class="xp-store-name">${esc(i.name)}</div>
            <div class="xp-store-desc">${esc(i.desc)}</div>
            <div class="xp-store-price">₹${i.price} <span class="small-muted" style="font-weight:400;">· ${cost.toLocaleString()} XP</span></div>
            ${state.premium
              ? `<button class="btn btn-sm ${afford?'btn-volt':'btn-ghost'}" ${afford?'':'disabled'} onclick="redeemXpItem('${i.id}',true)">${afford?'Redeem':'Need '+(cost-coinBalance()).toLocaleString()+' more XP'}</button>`
              : `<button class="btn btn-sm btn-ghost" onclick="setView('paywall')">Premium Only</button>`}
          </div>`;
        }).join('')}
      </div>
      ${state.redeemedItems && state.redeemedItems.length ? `
        <div class="xp-store-history">
          <div class="small-muted" style="font-weight:700;margin:12px 0 8px;">Your Redemptions</div>
          ${state.redeemedItems.slice(0,5).map(r=>`<div class="breakdown-row"><span>${r.icon} ${esc(r.name)}</span><span class="small-muted">${new Date(r.redeemedAt).toLocaleDateString()}</span></div>`).join('')}
        </div>
      `:''}
    </div>`;
}

/* ================= SHARE MY PROGRESS (ported same-to-same from index reference) ================= */
// Builds a shareable progress card (image) + invite message on the device.
// Only fitness stats are included — never weight, age, email or other profile details.
const shareUi = {showName:true, msg:'', edited:false};
function shareStats(){
  const badgesEarned = BADGE_DEFS.filter(b=>state.badges[b.id]).length;
  return {
    name: ((state.currentUser && state.currentUser.name) || 'Athlete').trim().split(/\s+/)[0],
    level: levelForXp(state.xp)+1, xp: state.xp||0, streak: state.streak||0,
    workouts: state.workoutsCompleted||0, reps: Math.round(state.totalReps||0),
    kcal: Math.round(state.totalCalories||0),
    badges: badgesEarned, badgeTotal: BADGE_DEFS.length,
    week: (state.streakDays||[]).map(d=>!!d)
  };
}
function shareLink(){ return (typeof SHARE_URL!=='undefined' && SHARE_URL) ? SHARE_URL : window.location.href.split('#')[0]; }
function buildShareMessage(){
  const t = shareStats();
  const bits = [`Level ${t.level}`];
  if(t.streak>0) bits.push(`${t.streak}-day streak 🔥`);
  if(t.workouts>0) bits.push(`${t.workouts} workout${t.workouts===1?'':'s'}`);
  if(t.reps>0) bits.push(`${t.reps.toLocaleString()} reps`);
  const started = (t.workouts===0 && t.reps===0);
  return (started
    ? `🚀 I just started my fitness journey on FitQuest AI — an AI coach that watches your form and cheers you on! `
    : `💪 I'm training with FitQuest AI, an AI fitness coach that checks my form live. So far: ${bits.join(', ')}. `)
    + `Join me and let's keep each other motivated! 👉 ${shareLink()}`;
}
function initShareCard(){
  const box = el('sp-msg'); if(!box) return;
  if(!shareUi.edited) shareUi.msg = buildShareMessage();
  box.value = shareUi.msg;
  const nm = el('sp-name'); if(nm) nm.checked = shareUi.showName;
  drawShareCard();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ window._shareDrawKey=null; drawShareCard(); }); // redraw once web fonts load
}
function shareToggleName(on){ shareUi.showName = on; drawShareCard(); }
function shareResetMsg(){ shareUi.edited=false; shareUi.msg=buildShareMessage(); const b=el('sp-msg'); if(b) b.value=shareUi.msg; }
function drawShareCard(){
  const cv = el('share-canvas'); if(!cv) return;
  // Skip the heavy 1080×1350 redraw when nothing changed (profile re-renders often).
  try{
    const t0 = shareStats();
    const key = [t0.level,t0.xp,t0.streak,t0.workouts,t0.reps,t0.kcal,t0.badges,t0.week.join(''),shareUi.showName].join('|');
    if(window._shareDrawKey===key) return;
    window._shareDrawKey = key;
  }catch(e){}
  const t = shareStats(), W=1080, H=1350, P=72, ctx = cv.getContext('2d');
  const DISP = '"Big Shoulders Display", "Arial Narrow", sans-serif', BODY = '"Space Grotesk", "Segoe UI", Arial, sans-serif';
  const rr = (x,y,w,h,r)=>{ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,r); else ctx.rect(x,y,w,h); };
  // background
  const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0b0d10'); g.addColorStop(1,'#182029');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const glow = ctx.createRadialGradient(W-120,140,10,W-120,140,620); glow.addColorStop(0,'rgba(212,255,63,.22)'); glow.addColorStop(1,'rgba(212,255,63,0)');
  ctx.fillStyle = glow; ctx.fillRect(0,0,W,H);
  // logo
  ctx.fillStyle = '#d4ff3f'; rr(P,P,84,84,20); ctx.fill();
  ctx.fillStyle = '#0b0d10'; ctx.font = `700 60px ${DISP}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('F', P+42, P+46);
  ctx.textAlign='left'; ctx.fillStyle = '#ffffff'; ctx.font = `700 52px ${DISP}`; ctx.fillText('FITQUEST AI', P+108, P+44);
  // headline
  ctx.textBaseline='alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = `500 40px ${BODY}`;
  ctx.fillText(shareUi.showName ? `${t.name}'s fitness progress` : 'My fitness progress', P, 290);
  ctx.fillStyle = '#d4ff3f'; ctx.font = `800 210px ${DISP}`;
  ctx.fillText(`LEVEL ${t.level}`, P, 470);
  ctx.fillStyle = '#ffffff'; ctx.font = `600 58px ${BODY}`;
  ctx.fillText(`${t.xp.toLocaleString()} XP earned`, P, 550);
  // stat tiles
  const tiles = [['🔥 '+t.streak,'Day streak'],[String(t.workouts),'Workouts'],[t.reps.toLocaleString(),'Total reps'],[t.kcal.toLocaleString(),'Calories burned']];
  const tw=444, th=190, gap=48;
  tiles.forEach((tile,i)=>{
    const x = P + (i%2)*(tw+gap), y = 610 + Math.floor(i/2)*(th+24);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(x,y,tw,th,28); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth=2; rr(x,y,tw,th,28); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 84px ${DISP}`; ctx.fillText(tile[0], x+34, y+104);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `500 30px ${BODY}`; ctx.fillText(tile[1], x+34, y+152);
  });
  // this week
  const wy = 1080;
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `600 28px ${BODY}`; ctx.fillText('THIS WEEK', P, wy);
  ctx.textAlign='right'; ctx.fillText(`🏅 ${t.badges} of ${t.badgeTotal} badges`, W-P, wy); ctx.textAlign='left';
  const letters = ['M','T','W','T','F','S','S'], step = (W-2*P-64)/6;
  letters.forEach((L,i)=>{
    const cx = P+32+i*step, cy = wy+64, on = !!t.week[i];
    ctx.beginPath(); ctx.arc(cx,cy,32,0,Math.PI*2);
    if(on){ ctx.fillStyle='#d4ff3f'; ctx.fill(); ctx.fillStyle='#0b0d10'; } else { ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=3; ctx.stroke(); ctx.fillStyle='rgba(255,255,255,.5)'; }
    ctx.font = `700 28px ${BODY}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(on?'✓':L, cx, cy+2);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  });
  // invite footer
  ctx.fillStyle = '#d4ff3f'; ctx.fillRect(0,1214,W,H-1214);
  ctx.fillStyle = '#0b0d10'; ctx.font = `800 62px ${DISP}`; ctx.fillText('JOIN ME ON FITQUEST AI 💪', P, 1284);
  ctx.font = `500 30px ${BODY}`; ctx.fillText('Your AI fitness coach — let\'s train together!', P, 1326);
}
function shareCanvasBlob(){ return new Promise(res=>{ const cv=el('share-canvas'); cv.toBlob(b=>res(b),'image/png'); }); }
function shareGrantBonus(){
  const todayKey = new Date().toDateString();
  if(state.lastShareDate===todayKey) return false;
  state.lastShareDate = todayKey;
  addXp(SHARE_XP_REWARD, 'Shared my progress');
  saveStateToStorage();
  toast(`<b>🎉 Thanks for sharing!</b><br>+${SHARE_XP_REWARD} XP Coins earned.`);
  return true;
}
async function shareProgressNative(){
  const text = shareUi.msg;
  try{
    const blob = await shareCanvasBlob();
    const file = new File([blob], 'my-fitquest-progress.png', {type:'image/png'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], text, title:'My FitQuest AI progress'});
    } else if(navigator.share){
      await navigator.share({text, title:'My FitQuest AI progress'});
    } else if(navigator.clipboard){
      await navigator.clipboard.writeText(text);
      toast('<b>Message copied!</b><br>Paste it in any chat — and use Download to send the card image too.');
    } else { toast('<b>Sharing not supported here</b><br>Use Copy or Download instead.'); return; }
    if(shareGrantBonus()) renderProfile();
  }catch(e){ /* person closed the share sheet */ }
}
function shareProgressWhatsApp(){
  window.open('https://wa.me/?text='+encodeURIComponent(shareUi.msg), '_blank', 'noopener');
  toast('<b>WhatsApp opened</b><br>To attach your card, tap Download and add the image in the chat.');
  if(shareGrantBonus()) renderProfile();
}
function shareProgressCopy(){
  const done = ()=>{ toast('<b>Message copied!</b><br>Paste it to a friend or family group.'); if(shareGrantBonus()) renderProfile(); };
  if(navigator.clipboard) navigator.clipboard.writeText(shareUi.msg).then(done).catch(()=>toast('<b>Could not copy</b><br>Select the message text and copy it manually.'));
  else toast('<b>Could not copy</b><br>Select the message text and copy it manually.');
}
async function shareProgressDownload(){
  const blob = await shareCanvasBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'my-fitquest-progress.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  toast('<b>Card saved</b><br>Send the image to friends and family.');
}

function renderProfile(){
  const p=state.profile||{};
  // Build progress charts inline (uses profRange so tab clicks work)
  const hist = state.history.slice(-profRange);
  const filled = hist.length? hist : [{date:'—',workouts:0,reps:0,xp:0,calories:0,formScore:0}];
  el('view-profile').innerHTML = `
    <div class="pagehead"><div><h1 class="display">Profile</h1><p>Manage your account and fitness preferences.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="doLogout()">Log Out</button>
        <button class="btn btn-outline" style="border-color:var(--coral);color:var(--coral);" onclick="setView('delete')">Delete Account</button>
      </div>
    </div>

    <div class="profile-head">
      <div class="avatar-lg">${initials(state.currentUser.name)}</div>
      <div>
        <div style="font-weight:700;font-size:19px;">${esc(state.currentUser.name)}</div>
        <div class="small-muted">${esc(state.currentUser.email)}</div>
        <div class="small-muted">Level ${levelForXp(state.xp)+1} · ${state.xp} XP</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Edit Profile</div>
      <div class="row2">
        <div class="field"><label>Age</label><input id="pf-age" type="number" value="${esc(p.age||'')}"></div>
        <div class="field"><label>Gender</label><input id="pf-gender" value="${esc(p.gender||'')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Height (cm)</label><input id="pf-height" type="number" value="${esc(p.height||'')}"></div>
        <div class="field"><label>Weight (kg)</label><input id="pf-weight" type="number" value="${esc(p.weight||'')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>City</label><input id="pf-city" value="${esc(p.city||'')}"></div>
        <div class="field"><label>Goal</label>
          <select id="pf-goal">${['Improve Fitness','Build Strength','Lose Weight','Improve Stamina','Stay Active'].map(g=>`<option ${g===p.goal?'selected':''}>${g}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Fitness Level</label>
        <select id="pf-level">${['Beginner','Intermediate','Advanced'].map(l=>`<option ${l===p.level?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <button class="btn btn-volt" onclick="saveProfile()">Save Changes</button>
    </div>

    <div class="card mt">
      <div class="card-title">Display Preference</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:14.5px;">Appearance</div>
          <div class="small-muted" style="margin-top:3px;">Dark is easy on the eyes at night. Light is better in bright daylight.</div>
        </div>
        <div class="theme-seg" role="group" aria-label="Display preference">
          <button data-theme="dark" class="${(getTheme()==='light')?'':'on'}" onclick="setTheme('dark');renderProfile();">🌙 Dark</button>
          <button data-theme="light" class="${(getTheme()==='light')?'on':''}" onclick="setTheme('light');renderProfile();">☀️ Light</button>
        </div>
      </div>
    </div>

    <!-- ===== PROGRESS ANALYTICS ===== -->
    <div class="card mt">
      <div class="card-title" style="font-size:14px;color:var(--volt);letter-spacing:0;text-transform:none;font-weight:700;margin-bottom:14px;">📈 Progress Analytics</div>
      <div class="range-tabs" style="margin-bottom:12px;">
        ${[7,30,90].map(r=>`<button class="filter-chip ${r===profRange?'on':''}" onclick="profRange=${r};renderProfile();">${r} Days</button>`).join('')}
      </div>
      <div class="two-col">
        ${miniChart('Reps per Session','reps',filled,'#d4ff3f')}
        ${miniChart('XP Earned','xp',filled,'#4fc3f7')}
      </div>
      <div class="two-col mt">
        ${miniChart('Calories Burned','calories',filled,'#ff5d5d')}
        ${miniChart('Form Score','formScore',filled,'#3ddc97')}
      </div>
    </div>

    <div class="card mt" id="share-progress-card">
      <div class="card-title">🤝 Share My Progress</div>
      <p class="small-muted" style="margin:6px 0 14px;">Show your friends and family how far you've come — and invite them to train with you.</p>
      <div class="sp-wrap">
        <div class="sp-preview"><canvas id="share-canvas" width="1080" height="1350" aria-label="Your progress card"></canvas></div>
        <div class="sp-side">
          <label class="sp-check"><input type="checkbox" id="sp-name" checked onchange="shareToggleName(this.checked)"> Show my first name on the card</label>
          <div class="small-muted" style="font-weight:600;margin:12px 0 6px;">Message <button class="sp-link" onclick="shareResetMsg();initShareCard()">Reset</button></div>
          <textarea id="sp-msg" class="sp-msg" rows="6" oninput="shareUi.msg=this.value;shareUi.edited=true"></textarea>
          <div class="sp-btns">
            <button class="btn btn-volt btn-sm" onclick="shareProgressNative()">📤 Share</button>
            <button class="btn btn-ghost btn-sm" onclick="shareProgressWhatsApp()">💬 WhatsApp</button>
            <button class="btn btn-ghost btn-sm" onclick="shareProgressCopy()">📋 Copy message</button>
            <button class="btn btn-ghost btn-sm" onclick="shareProgressDownload()">⬇️ Download card</button>
          </div>
          <div class="small-muted" style="margin-top:12px;line-height:1.55;">
            The card is created on your device. It shows only your fitness stats — never your weight, age or email.
            Sharing earns your daily +${SHARE_XP_REWARD} XP bonus (once a day, same as Share &amp; Earn).
          </div>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-title">Badges</div>
      <div class="badge-row">
        ${BADGE_DEFS.map(b=>`<div class="badge-pill" style="opacity:${state.badges[b.id]?1:0.35}" title="${b.desc}">${b.icon} ${b.name}</div>`).join('')}
      </div>
    </div>

    <div class="two-col mt">
      <div class="card">
        <div class="card-title">📤 Share &amp; Earn</div>
        <p class="small-muted" style="margin:6px 0 14px;">Share FitQuest AI with a friend and earn ${SHARE_XP_REWARD} XP Coins — once per day.</p>
        <button class="btn btn-volt btn-sm" onclick="shareApp()">${state.lastShareDate===new Date().toDateString() ? '✅ Shared Today' : 'Share the App'}</button>
      </div>
      <div class="card">
        <div class="card-title">🔔 Workout Reminders</div>
        <p class="small-muted" style="margin:6px 0 14px;">Get nudged with a notification if you miss a workout day.</p>
        <button class="btn ${(state.settings&&state.settings.remindersEnabled)?'btn-volt':'btn-ghost'} btn-sm" onclick="toggleReminders()">${(state.settings&&state.settings.remindersEnabled)?'🔔 Reminders On':'🔕 Enable Reminders'}</button>
      </div>
    </div>

    <div class="card mt">
      <div class="card-title" style="font-size:14px;color:var(--volt-text);letter-spacing:0;text-transform:none;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span>🪙 XP Store</span>
        <span class="xp-balance-pill">🪙 ${coinBalance().toLocaleString()} XP</span>
      </div>
      <div class="breakdown-row"><span>🎟️ Discount Vouchers</span><span class="small-muted">${XP_STORE_VOUCHERS.length} available · from ${Math.min(...XP_STORE_VOUCHERS.map(v=>v.costXp)).toLocaleString()} XP</span></div>
      <div class="breakdown-row"><span>🛍️ Fitness Products</span><span class="small-muted">${XP_STORE_PRODUCTS.length} items · ${state.premium?'unlocked':'Premium'}</span></div>
      <div class="breakdown-row" style="border-bottom:none;"><span>🎫 Your Redemptions</span><span class="small-muted">${(state.redeemedItems||[]).length} claimed</span></div>
      <button class="btn btn-volt btn-sm btn-block mt" onclick="setView('xpstore')">Open XP Store →</button>
    </div>
    <div class="card mt">
      <div class="card-title">Data Storage (7-Day Local)</div>
      ${(() => {
        const info = getStorageInfo();
        if(info.status === 'saved'){
          return `
            <div class="breakdown-row"><span>Status</span><span style="color:var(--green);">✓ Saved</span></div>
            <div class="breakdown-row"><span>Size</span><span>${info.size} MB</span></div>
            <div class="breakdown-row"><span>Last Save</span><span>${new Date(info.savedAt).toLocaleString()}</span></div>
            <div class="breakdown-row"><span>Workout Days</span><span>${info.historyDays} day${info.historyDays!==1?'s':''}</span></div>
            <div class="breakdown-row"><span>Active Challenges</span><span>${info.challenges}</span></div>
            <div style="margin-top:12px;font-size:12px;color:var(--muted);">Your data is stored on your laptop for 7 days. Older entries are automatically removed.</div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-ghost" onclick="exportStateAsJSON()">📥 Export Backup</button>
              <button class="btn btn-sm btn-ghost" onclick="importStateFromJSON()">📤 Restore Backup</button>
              <button class="btn btn-sm btn-outline" onclick="clearAllStorage()" style="border-color:var(--coral);color:var(--coral);">🗑 Clear Data</button>
            </div>
          `;
        }else{
          return `<p class="small-muted">No saved data yet. Start working out and data will be saved automatically.</p>`;
        }
      })()}
    </div>
    <div class="card mt">
      <div class="card-title">Privacy & Safety</div>
      <p class="small-muted">Camera footage is processed locally for pose estimation and is never permanently stored. Nutrition figures are estimates. FitQuest AI is a fitness tool, not a medical device, and does not provide medical diagnoses. You control your data and can request deletion at any time. Your workout data is stored locally on your device for 7 days only.</p>
    </div>`;
  try{ initShareCard(); }catch(e){}
}
function saveProfile(){
  state.profile = {
    age: el('pf-age').value, gender: el('pf-gender').value,
    height: el('pf-height').value, weight: el('pf-weight').value,
    city: el('pf-city').value, goal: el('pf-goal').value, level: el('pf-level').value,
    activity: (state.profile && state.profile.activity)||'Moderate',
    theme: getTheme(),
  };
  syncUserRecord();
  persistUsersRegistry();
  apiSyncProfile();
  toast('<b>Profile updated</b>');
  saveStateToStorage();
  renderProfile();
}
function doLogout(){
  stopCamera();
  apiSetToken(null);
  try{ localStorage.removeItem('fitquest_session'); }catch(e){}
  viewHistory=[];
  location.reload();
}
/* ================= DELETE ACCOUNT PAGE ================= */
function renderDeleteView(){
  el('view-delete').innerHTML = `
    <div class="paywall-wrap" style="max-width:520px;">
      <div class="paywall-back">
        <button class="paywall-back-btn" onclick="setView('profile')">←</button>
        <h1 class="display" style="font-size:24px;">🗑️ Delete Account</h1>
      </div>
      <div class="card" style="border-color:var(--coral);text-align:center;padding:32px 24px;">
        <div style="font-size:44px;">⚠️</div>
        <h2 class="display" style="font-size:26px;margin:12px 0 8px;">Are You Sure To Delete Your Fitness Account</h2>
        <p class="small-muted" style="margin-bottom:6px;">Workouts, meals, XP, badges, suggestions and settings will be permanently erased from the server and this device. This cannot be undone.</p>
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button class="btn btn-ghost btn-block" onclick="setView('profile')">No</button>
          <button class="btn btn-block" id="del-yes-btn" style="background:var(--coral);color:#fff;font-weight:700;" onclick="doDeleteAccount()">Yes</button>
        </div>
      </div>
    </div>`;
}
async function confirmDeleteAccount(){
  setView('delete');
}
async function doDeleteAccount(){
  const btn = el('del-yes-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Deleting…'; }
  const email = state.currentUser ? state.currentUser.email : null;
  // Backend account: wipe server-side first. Local-only account: wipe device records.
  if(email && typeof apiToken==='function' && apiToken()){
    try{
      await apiReq('/api/users/me',{method:'DELETE'});
    }catch(e){
      toast('<b>Delete failed</b><br>'+esc(typeof prettyAuthError==='function'?prettyAuthError(e.message):e.message));
      if(btn){ btn.disabled = false; btn.textContent = 'Yes'; }
      return;
    }
  } else if(email){
    try{
      state.users = (state.users||[]).filter(u=>u.email!==email);
      persistUsersRegistry();
    }catch(e){}
  }
  try{
    if(email){ localStorage.removeItem(userStorageKey(email)); localStorage.removeItem(userMetaKey(email)); }
    localStorage.removeItem('fitquest_session');
  }catch(e){}
  try{ apiSetToken(null); }catch(e){}
  try{ stopCamera(); }catch(e){}
  toast('<b>Account deleted</b><br>Sorry to see you go.');
  setTimeout(()=>location.reload(), 700);
}

/* ================= JUDGE DIRECT LINK (?judge=TOKEN) =================
   Password-less judge entry: swaps the link token for a judge login token.
   Token is wiped from the URL immediately; bad tokens fall through to the
   normal login screen. Scoped to the judge account server-side. */
async function handleJudgeLink(){
  let tok=null;
  try{ tok=new URLSearchParams(location.search).get('judge'); }catch(e){}
  if(!tok) return false;
  try{ history.replaceState(null,'',location.pathname); }catch(e){}
  try{
    const out=await apiReq('/api/auth/judge-exchange',{method:'POST',body:{token:tok},timeoutMs:15000});
    if(!(out&&out.access_token)) throw new Error('exchange failed');
    apiSetToken(out.access_token);
    const me=await apiFetchMe();
    if(me&&me.email){
      state.currentUser={name:me.name,email:me.email};
      try{localStorage.setItem('fitquest_session',me.email);}catch(e){}
      await hydrateFromServer();
      toast('<b>Welcome, Judge</b><br>Signed in automatically.');
      requireProfileOrEnter(me);
      return true;
    }
  }catch(e){
    toast('<b>Judge link invalid</b><br>Please log in normally.');
  }
  return false;
}
/* ================= INIT ================= */
renderAuthLogin();
handleJudgeLink(); // ?judge=TOKEN direct entry (judges skip login)
handleGoogleCallback(); // Google OAuth return visit? exchange session -> enter app

/* Restore a previous session after a reload (camera round-trip, OS tab kill).
   Backend users re-validate the token; local users restore from registry. */
async function bootSession(){
  let email=null;
  try{ email=localStorage.getItem('fitquest_session'); }catch(e){}
  if(!email) return;
  state.currentUser={name:email.split('@')[0],email};
  if(apiToken()){
    try{
      const me=await apiReq('/api/auth/me');
      state.currentUser={name:me.name,email};
      if(me.profile) state.profile=me.profile;
      await hydrateFromServer();
      requireProfileOrEnter({profile:state.profile});
      return;
    }catch(e){
      // Dead token -> drop it. Network error -> keep it, use local snapshot.
      if(String((e&&e.message)||e).indexOf('401')===0) apiSetToken(null);
    }
  }
  // Local snapshot restore (works offline; backend users have one too).
  try{
    const reg=loadUsersRegistry();
    const u=reg.find(x=>x.email===email);
    if(u){ state.users=reg; state.currentUser={name:u.name,email:u.email}; if(u.profile) state.profile=u.profile; }
    requireProfileOrEnter({profile:state.profile});
  }catch(e){}
}
bootSession();

/* Flush state when the tab hides / closes (camera app switch, incoming call)
   so nothing is lost even if the OS discards the page. */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){ try{ saveStateToStorage(); }catch(e){} }
});
window.addEventListener('pagehide', ()=>{ try{ saveStateToStorage(); }catch(e){} });

/* Boot loading screen — waits for fonts + a minimum display time so it
   reads as an intentional splash rather than a flash. */
(function boot(){
  const started = Date.now();
  const minShow = 900;
  const finish = ()=>{
    const wait = Math.max(0, minShow-(Date.now()-started));
    setTimeout(()=>{ el('loading-screen').classList.add('hide'); }, wait);
  };
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(finish).catch(finish); }
  else { finish(); }
  setTimeout(finish, 2500); // safety fallback
})();
