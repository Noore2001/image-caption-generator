import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels = false;

const $ = id => document.getElementById(id);
const el = { drop:$('drop'), file:$('file'), preview:$('preview'), dropText:$('dropText'), url:$('urlInput'),
  urlBtn:$('urlBtn'), gen:$('genBtn'), status:$('status'), bar:$('bar'), result:$('result'), tabs:$('tabs'),
  caption:$('caption'), tags:$('tags'), copy:$('copyBtn'), speak:$('speakBtn'), dl:$('dlBtn'),
  regen:$('regenBtn'), hist:$('history'), clear:$('clearBtn'), theme:$('themeBtn') };

const STYLES = ['Descriptive','Short','Social','Alt text','Formal'];
const STOP = new Set('a an the of in on at with and is are to for his her their its it this that two three there next near top front some while from by as'.split(' '));
let captioner, base = '', styleIdx = 0, imgSrc = '';
let history = JSON.parse(localStorage.getItem('captions') || '[]');

const say = (msg, err) => { el.status.textContent = msg; el.status.classList.toggle('err', !!err); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const keywords = t => [...new Set(t.toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP.has(w)))].slice(0, 6);

function format(text, style) {
  const t = text.trim().replace(/\.$/, ''), tags = keywords(t).map(w => '#' + w).join(' ');
  switch (style) {
    case 'Short':   return cap(t.split(/\b(?:with|while|next to|in front of)\b/)[0].trim()) + '.';
    case 'Social':  return `${cap(t)} ✨\n\n${tags}`;
    case 'Alt text':return `Image of ${t}.`;
    case 'Formal':  return `The image depicts ${t}.`;
    default:        return cap(t) + '.';
  }
}

function render() {
  el.tabs.innerHTML = '';
  STYLES.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = s; b.className = 'ghost'; b.role = 'tab';
    b.setAttribute('aria-selected', i === styleIdx);
    b.onclick = () => { styleIdx = i; render(); };
    el.tabs.append(b);
  });
  el.caption.value = format(base, STYLES[styleIdx]);
  el.tags.innerHTML = '';
  keywords(base).forEach(w => {
    const c = document.createElement('button');
    c.textContent = '#' + w; c.onclick = () => navigator.clipboard.writeText('#' + w).then(() => say(`Copied #${w}`));
    el.tags.append(c);
  });
  el.result.hidden = false;
}

function setImage(src) {
  imgSrc = src; el.preview.src = src; el.preview.hidden = false; el.dropText.hidden = true;
  el.gen.disabled = false; el.result.hidden = true; say('Image ready. Click Generate caption.');
}
function loadFile(f) {
  if (!f || !f.type.startsWith('image/')) return say('Please choose an image file (JPG, PNG, WebP, GIF).', true);
  const r = new FileReader(); r.onload = () => setImage(r.result); r.readAsDataURL(f);
}

async function getModel() {
  if (captioner) return captioner;
  el.bar.hidden = false;
  captioner = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning', {
    progress_callback: p => {
      if (p.status === 'progress') {
        el.bar.firstElementChild.style.width = p.progress + '%';
        say(`Downloading model: ${Math.round(p.progress)}%`);
      }
    }
  });
  el.bar.hidden = true;
  return captioner;
}

async function generate() {
  el.gen.disabled = el.regen.disabled = true;
  try {
    say('Loading model…');
    const model = await getModel();
    say('Generating caption…');
    const out = await model(imgSrc, { max_new_tokens: 40 });
    base = out[0].generated_text;
    render(); say('Done.');
    history.unshift({ src: await thumb(imgSrc), text: base, date: Date.now() });
    history = history.slice(0, 12); save(); drawHistory();
  } catch (e) {
    console.error(e);
    say('Could not generate a caption. If you loaded a URL, the site may block cross-origin images; download it and upload instead.', true);
  } finally { el.gen.disabled = el.regen.disabled = false; el.bar.hidden = true; }
}

function thumb(src) {
  return new Promise(res => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 64;
      const s = Math.min(i.width, i.height); c.getContext('2d').drawImage(i, (i.width - s) / 2, (i.height - s) / 2, s, s, 0, 0, 64, 64);
      try { res(c.toDataURL('image/jpeg', .7)); } catch { res(''); } };
    i.onerror = () => res(''); i.src = src;
  });
}

const save = () => { try { localStorage.setItem('captions', JSON.stringify(history)); } catch {} };
function drawHistory() {
  el.hist.innerHTML = history.length ? '' : '<li class="empty">Captions you generate will appear here.</li>';
  history.forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `${h.src ? `<img src="${h.src}" alt="">` : ''}<span></span>`;
    li.lastChild.textContent = cap(h.text) + '.';
    li.onclick = () => { base = h.text; render(); scrollTo({ top: 0, behavior: 'smooth' }); };
    el.hist.append(li);
  });
}

// Events
el.drop.onclick = () => el.file.click();
el.drop.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), el.file.click());
el.file.onchange = () => loadFile(el.file.files[0]);
['dragenter', 'dragover'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.remove('over'); }));
el.drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
addEventListener('paste', e => { const f = [...e.clipboardData.files].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });
el.urlBtn.onclick = () => el.url.value.trim() && setImage(el.url.value.trim());
el.gen.onclick = el.regen.onclick = generate;
el.copy.onclick = () => navigator.clipboard.writeText(el.caption.value).then(() => say('Caption copied.'));
el.speak.onclick = () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(el.caption.value)); };
el.dl.onclick = () => { const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([el.caption.value], { type: 'text/plain' })); a.download = 'caption.txt'; a.click(); };
el.clear.onclick = () => { history = []; save(); drawHistory(); };
el.theme.onclick = () => {
  const d = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = d ? 'light' : 'dark';
  el.theme.textContent = d ? 'Dark mode' : 'Light mode';
  try { localStorage.setItem('theme', d ? 'light' : 'dark'); } catch {}
};
if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme:dark)').matches)) el.theme.click();
drawHistory();
