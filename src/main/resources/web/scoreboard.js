let pagesConfig = [];
let currentPageIndex = 0;
let rotationMode = 'manual';
let rotationSeconds = 10;

function createDefaultPage(index = 1) {
    return {
        id: 'page-' + index,
        name: 'Pagina ' + index,
        enabled: true,
        title: '§aServerManager',
        lines: ['§7Welkom!', '§fOnline: §a%online%', '§fHave fun!']
    };
}

function ensurePagesInitialized() {
    if (!Array.isArray(pagesConfig) || pagesConfig.length === 0) {
        pagesConfig = [createDefaultPage(1)];
        currentPageIndex = 0;
    }
}

function persistEditorToCurrentPage() {
    ensurePagesInitialized();
    const page = pagesConfig[currentPageIndex];
    if (!page) return;

    const titleEl = document.getElementById('title');
    page.title = titleEl ? serializeEditor(titleEl).trim() : '';
    page.lines = [...document.querySelectorAll('#lines .editor-field')].map(el => serializeEditor(el));
}

function loadCurrentPageIntoEditor() {
    ensurePagesInitialized();
    const page = pagesConfig[currentPageIndex];
    if (!page) return;

    const titleEl = document.getElementById('title');
    if (titleEl) {
        titleEl.innerHTML = mcToHtml(page.title || '');
    }

    const linesDiv = document.getElementById('lines');
    document.querySelectorAll('.editor-field').forEach(ed => stopEditorMagic(ed));
    linesDiv.innerHTML = '';
    (page.lines || []).forEach(l => addLine(l));
    if (!page.lines || page.lines.length === 0) addLine('');

    const pageSelect = document.getElementById('pageSelect');
    if (pageSelect) pageSelect.value = String(currentPageIndex);

    updatePreview();
}

function renderPageControls() {
    ensurePagesInitialized();

    const pageSelect = document.getElementById('pageSelect');
    const visibilityList = document.getElementById('pageVisibilityList');
    const modeSelect = document.getElementById('rotationMode');
    const secondsInput = document.getElementById('rotationSeconds');
    const autoIntervalWrap = document.getElementById('autoIntervalWrap');
    const autoPagesWrap = document.getElementById('autoPagesWrap');

    if (pageSelect) {
        pageSelect.innerHTML = '';
        pagesConfig.forEach((p, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = (p.name || ('Pagina ' + (i + 1))) + (p.enabled ? '' : ' (verborgen)');
            pageSelect.appendChild(opt);
        });
        pageSelect.value = String(currentPageIndex);
    }

    if (visibilityList) {
        visibilityList.innerHTML = '';
        pagesConfig.forEach((p, i) => {
            const row = document.createElement('label');
            row.className = 'page-vis-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!p.enabled;
            cb.addEventListener('change', () => {
                p.enabled = cb.checked;
                renderPageControls();
                scheduleAutoSave();
            });

            const txt = document.createElement('span');
            txt.className = 'page-vis-name';
            txt.textContent = p.name || ('Pagina ' + (i + 1));

            row.appendChild(cb);
            row.appendChild(txt);
            visibilityList.appendChild(row);
        });
    }

    if (modeSelect) modeSelect.value = rotationMode;
    if (secondsInput) secondsInput.value = String(rotationSeconds);

    const autoMode = rotationMode === 'auto';
    if (autoIntervalWrap) autoIntervalWrap.style.display = autoMode ? '' : 'none';
    if (autoPagesWrap) autoPagesWrap.style.display = autoMode ? '' : 'none';
}

function setCurrentPageIndex(newIndex) {
    if (newIndex < 0 || newIndex >= pagesConfig.length) return;
    persistEditorToCurrentPage();
    currentPageIndex = newIndex;
    loadCurrentPageIntoEditor();
    renderPageControls();

    // In manual mode, switching page in the UI should switch in-game immediately.
    if (rotationMode === 'manual') {
        save().catch(err => console.error(err));
    }
}

function wirePageControls() {
    const pageSelect = document.getElementById('pageSelect');
    const addPageBtn = document.getElementById('addPageBtn');
    const removePageBtn = document.getElementById('removePageBtn');
    const modeSelect = document.getElementById('rotationMode');
    const secondsInput = document.getElementById('rotationSeconds');

    if (pageSelect) {
        pageSelect.addEventListener('change', () => {
            setCurrentPageIndex(parseInt(pageSelect.value, 10) || 0);
        });
    }

    if (addPageBtn) {
        addPageBtn.addEventListener('click', () => {
            persistEditorToCurrentPage();
            const index = pagesConfig.length + 1;
            pagesConfig.push(createDefaultPage(index));
            renumberPages();
            currentPageIndex = pagesConfig.length - 1;
            renderPageControls();
            loadCurrentPageIntoEditor();
            scheduleAutoSave();
        });
    }

    if (removePageBtn) {
        removePageBtn.addEventListener('click', () => {
            if (pagesConfig.length <= 1) return;
            pagesConfig.splice(currentPageIndex, 1);
            renumberPages();
            if (currentPageIndex >= pagesConfig.length) currentPageIndex = pagesConfig.length - 1;
            renderPageControls();
            loadCurrentPageIntoEditor();
            scheduleAutoSave();
        });
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            rotationMode = modeSelect.value === 'auto' ? 'auto' : 'manual';
            // Toggle auto-only controls immediately for responsive UX.
            renderPageControls();

            // Persist mode change immediately so in-game behavior updates at once.
            save().catch(err => console.error(err));
        });
    }

    if (secondsInput) {
        secondsInput.addEventListener('change', () => {
            const parsed = parseInt(secondsInput.value, 10);
            rotationSeconds = Number.isFinite(parsed) ? Math.max(1, parsed) : 10;
            secondsInput.value = String(rotationSeconds);
            scheduleAutoSave();
        });
    }
}

function renumberPages() {
    pagesConfig.forEach((p, i) => {
        const n = i + 1;
        p.id = 'page-' + n;
        p.name = 'Pagina ' + n;
    });
}

function addLine(value = "") {
    const wrapper = document.createElement('div');
    wrapper.className = 'line-row';

    // toolbar + editor + remove
    wrapper.innerHTML = `
        <div class="row-top">
            <div class="editor-field" contenteditable="true" spellcheck="false"></div>
            <button class="remove" type="button">✖</button>
        </div>
        <div class="toolbar">
            <div class="color-row">
                <!-- Ordered dark -> light following spectrum-ish order -->
                <button class="color-swatch" data-code="§0" style="background:#000000"></button>
                <button class="color-swatch" data-code="§8" style="background:#555555"></button>
                <button class="color-swatch" data-code="§1" style="background:#0000AA"></button>
                <button class="color-swatch" data-code="§9" style="background:#5555FF"></button>
                <button class="color-swatch" data-code="§3" style="background:#00AAAA"></button>
                <button class="color-swatch" data-code="§b" style="background:#55FFFF"></button>
                <button class="color-swatch" data-code="§2" style="background:#00AA00"></button>
                <button class="color-swatch" data-code="§a" style="background:#55FF55"></button>
                <button class="color-swatch" data-code="§4" style="background:#AA0000"></button>
                <button class="color-swatch" data-code="§c" style="background:#FF5555"></button>
                <button class="color-swatch" data-code="§6" style="background:#FFAA00"></button>
                <button class="color-swatch" data-code="§e" style="background:#FFFF55"></button>
                <button class="color-swatch" data-code="§5" style="background:#AA00AA"></button>
                <button class="color-swatch" data-code="§d" style="background:#FF55FF"></button>
                <button class="color-swatch" data-code="§7" style="background:#AAAAAA"></button>
                <button class="color-swatch" data-code="§f" style="background:#FFFFFF;border:1px solid #ddd"></button>
            </div>
                <div class="effects">
                    <button class="eff-btn" data-code="§l" title="Vet (Bold)" aria-label="Vet (Bold)">
                        <span class="font-icon bold-icon">B</span>
                    </button>
                    <button class="eff-btn" data-code="§o" title="Schuingedrukt (Italic)" aria-label="Schuingedrukt (Italic)">
                        <span class="font-icon italic-icon">Z</span>
                    </button>
                    <button class="eff-btn" data-code="§n" title="Onderlijn (Underline)" aria-label="Onderlijn (Underline)">
                        <span class="font-icon underline-icon">U</span>
                    </button>
                    <button class="eff-btn" data-code="§m" title="Doorstreep (Strikethrough)" aria-label="Doorstreep (Strikethrough)">
                        <span class="font-icon strike-icon">A</span>
                    </button>
                    <button class="eff-btn" data-code="§k" title="Magic (Verberg/obfuscate)" aria-label="Magic (Obfuscate)">
                        <svg class="star-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5l1.6 3.3 3.6.5-2.6 2.2.6 3.6L8 10.6 4.8 11.1l.6-3.6L2.8 5.3l3.6-.5L8 1.5z"/></svg>
                    </button>
                    <button class="eff-btn reset-btn" data-code="§r" title="Reset" aria-label="Reset">
                        <svg class="reset-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 12a9 9 0 1 0-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                            <polyline points="23 3 23 9 17 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        </svg>
                    </button>
                </div>
        </div>
    `;

    const lines = document.getElementById('lines');
    lines.appendChild(wrapper);

    // set content (parse MC codes into styled HTML)
    const editor = wrapper.querySelector('.editor-field');
    editor.innerHTML = mcToHtml(value || '');
    editor.addEventListener('keydown', e=>{ if(e.key==='Enter') e.preventDefault(); });
    // update preview when content changes; also stop editor magic if none remain
    editor.addEventListener('input', ()=>{ updatePreview(); if(editor.querySelectorAll('.mc-magic-editor').length===0) stopEditorMagic(editor); scheduleAutoSave(); });
    // ensure first typed character becomes white by default
    attachDefaultWhiteBehavior(editor);
    // apply outline based on current color (white -> black outline, black -> white outline)
    applyEditorOutline(editor);

    const removeBtn = wrapper.querySelector('.remove');
    removeBtn.addEventListener('click', ()=> { stopEditorMagic(editor); wrapper.remove(); updatePreview(); scheduleAutoSave(); });

    // setup toolbar for this line
    const toolbar = wrapper.querySelector('.toolbar');
    setupToolbar(toolbar);
    // refresh preview after adding a new line
    updatePreview();
}

// removed helper not needed; remove handled in addLine

/* ================================================
   SAVE
================================================ */

let autoSaveTimer = null;
let saveInProgress = false;
let saveQueued = false;
let suppressAutoSave = false;

function scheduleAutoSave(delay = 220) {
    if (suppressAutoSave) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        save().catch(err => console.error(err));
    }, delay);
}

async function save() {
    if (saveInProgress) {
        saveQueued = true;
        return;
    }

    saveInProgress = true;
    const status = document.getElementById('status');
    persistEditorToCurrentPage();
    ensurePagesInitialized();
    const moduleId = getModuleIdFromPath();

    if (!moduleId) {
        status.textContent = 'Fout: module id niet gevonden';
        saveInProgress = false;
        return;
    }

    status.textContent = 'Opslaan...';
    try {
        const payload = new URLSearchParams();
        payload.set('mode', rotationMode);
        payload.set('rotationSeconds', String(rotationSeconds));
        payload.set('activePageId', pagesConfig[currentPageIndex]?.id || 'page-1');
        payload.set('pageCount', String(pagesConfig.length));

        pagesConfig.forEach((page, i) => {
            payload.set(`page.${i}.id`, page.id || `page-${i + 1}`);
            payload.set(`page.${i}.name`, page.name || `Pagina ${i + 1}`);
            payload.set(`page.${i}.enabled`, page.enabled ? 'true' : 'false');
            payload.set(`page.${i}.title`, page.title || '');
            payload.set(`page.${i}.lines`, (page.lines || []).join('\n'));
        });

        const res = await fetch('/api/modules/' + encodeURIComponent(moduleId) + '/scoreboard/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: payload.toString()
        });

        if (!res.ok) throw new Error(res.statusText || 'Save failed');
        status.textContent = 'Opgeslagen';
        setTimeout(()=> status.textContent = '', 1800);
    } catch (err) {
        status.textContent = 'Fout bij opslaan';
        console.error(err);
    } finally {
        saveInProgress = false;
        if (saveQueued) {
            saveQueued = false;
            scheduleAutoSave(50);
        }
    }
}

async function loadScoreboard(){
    const status = document.getElementById('status');
    const moduleId = getModuleIdFromPath();
    if (!moduleId) {
        status.textContent = 'Fout: module id niet gevonden';
        return;
    }

    status.textContent = 'Laden...';
    try{
        suppressAutoSave = true;
        const res = await fetch('/api/modules/' + encodeURIComponent(moduleId) + '/scoreboard/get');
        if(!res.ok) throw new Error(res.statusText||'Load failed');
        const data = await res.json();

        rotationMode = data.mode === 'auto' ? 'auto' : 'manual';
        rotationSeconds = Math.max(1, parseInt(data.rotationSeconds || 10, 10) || 10);

        if (Array.isArray(data.pages) && data.pages.length > 0) {
            pagesConfig = data.pages.map((p, i) => ({
                id: p.id || `page-${i + 1}`,
                name: p.name || `Pagina ${i + 1}`,
                enabled: p.enabled !== false,
                title: p.title || '',
                lines: Array.isArray(p.lines) ? p.lines : []
            }));
        } else {
            pagesConfig = [{
                id: 'page-1',
                name: 'Pagina 1',
                enabled: true,
                title: data.title || '§aServerManager',
                lines: Array.isArray(data.lines) ? data.lines : []
            }];
        }

        const activeId = data.activePageId || pagesConfig[0]?.id;
        const found = pagesConfig.findIndex(p => p.id === activeId);
        currentPageIndex = found >= 0 ? found : 0;

        renderPageControls();
        loadCurrentPageIntoEditor();
        status.textContent = '';
    }catch(e){
        status.textContent = 'Fout bij laden';
        console.error(e);
    } finally {
        suppressAutoSave = false;
    }
}

function getModuleIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('website');
    if (idx >= 0 && parts.length > idx + 1) {
        return decodeURIComponent(parts[idx + 1]);
    }
    return null;
}

// wire up UI
document.addEventListener('DOMContentLoaded', ()=>{
    ensurePagesInitialized();
    wirePageControls();
    renderPageControls();

    document.getElementById('addLineBtn').addEventListener('click', ()=>addLine(''));
    document.getElementById('saveBtn').addEventListener('click', save);
    // initialize global title toolbar
    const topToolbar = document.getElementById('toolbar');
        if(topToolbar) setupToolbar(topToolbar);
    // ensure title edits update preview live
    const titleDom = document.getElementById('title');
    if(titleDom){
        titleDom.addEventListener('input', ()=>{ updatePreview(); if(titleDom.querySelectorAll && titleDom.querySelectorAll('.mc-magic-editor').length===0) stopEditorMagic(titleDom); scheduleAutoSave(); });
        titleDom.addEventListener('keydown', e=>{ if(e.key==='Enter') e.preventDefault(); });
        attachDefaultWhiteBehavior(titleDom);
        applyEditorOutline(titleDom);
    }
    loadScoreboard();
    setupPreviewControls();
    setupDarkMode();
});

function setupDarkMode(){
    const btn = document.getElementById('darkToggle');
    if(!btn) return;
    const saved = localStorage.getItem('site-dark') === '1';
    const moonSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const sunSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const apply = (on)=>{
        if(on) document.body.classList.add('dark'); else document.body.classList.remove('dark');
        btn.setAttribute('aria-pressed', on? 'true':'false');
        btn.innerHTML = on? sunSvg : moonSvg;
        localStorage.setItem('site-dark', on? '1':'0');
    };
    apply(saved);
    btn.addEventListener('click', ()=> apply(!document.body.classList.contains('dark')));
}

// Apply outline around editor text when color is exactly white or black.
// Apply outline around editor text by sampling the effective text color inside the editor.
function applyEditorOutline(editor){
    if(!editor) return;

    // helper: get computed color string from a node (element or text node's parent)
    const getComputedColorOfNode = (node)=>{
        try{
            if(!node) return null;
            const el = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
            if(!el) return null;
            return window.getComputedStyle(el).color || null;
        }catch(e){ return null; }
    };

    // Try selection first (if selection within this editor)
    let colorStr = null;
    try{
        const sel = window.getSelection();
        if(sel && sel.rangeCount){
            const anchor = sel.anchorNode;
            if(anchor && editor.contains(anchor)){
                colorStr = getComputedColorOfNode(anchor);
            }
        }
    }catch(e){ colorStr = null; }

    // fallback: look for any inline-colored element inside editor
    if(!colorStr){
        const colored = editor.querySelector('[style*="color:"]') || editor.querySelector('font[color]');
        if(colored) colorStr = window.getComputedStyle(colored).color;
    }

    // fallback: pick first text node with content and sample its parent
    if(!colorStr){
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while((n = walker.nextNode())){
            if(n.nodeValue && n.nodeValue.trim().length){ colorStr = getComputedColorOfNode(n); break; }
        }
    }

    // final fallback: computed style of editor itself
    if(!colorStr) colorStr = window.getComputedStyle(editor).color;

    // parse colorStr into rgb
    const parseRgb = (s)=>{
        if(!s) return null;
        s = s.trim();
        // rgb/rgba
        let m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if(m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
        // hex
        m = s.match(/^#([0-9a-f]{6})$/i);
        if(m) return [parseInt(m[1].substr(0,2),16), parseInt(m[1].substr(2,2),16), parseInt(m[1].substr(4,2),16)];
        return null;
    };

    const rgb = parseRgb(colorStr);
    editor.classList.remove('outline-white','outline-black');
    if(!rgb) return;
    // compute simple luminance
    const lum = (0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]) / 255;
    // choose outline: dark text -> white outline; light text -> black outline
    if(lum < 0.5) editor.classList.add('outline-white'); else editor.classList.add('outline-black');
}

// When the user types the very first character in an empty editor, make that text white by default
function attachDefaultWhiteBehavior(editor){
    if(!editor) return;
    // keydown handles normal typing; paste handled separately
    editor.addEventListener('keydown', function firstCharHandler(e){
        if(e.key === 'Enter') return;
        // only react to character keys
        if(e.key && e.key.length === 1){
            const before = (editor.textContent||'').trim();
            if(before.length === 0){
                // don't override if an inline style was already set
                if(!editor.style.color){
                    editor.style.color = '#ffffff';
                    applyEditorOutline(editor);
                }
            }
        }
    });

    // If user pastes into empty editor
    editor.addEventListener('paste', ()=>{
        const before = (editor.textContent||'').trim();
        if(before.length === 0 && !editor.style.color){
            editor.style.color = '#ffffff';
            applyEditorOutline(editor);
        }
    });
}

function setupPreviewControls(){
    const preview = document.getElementById('sb-preview');
    const box = preview && preview.querySelector('.sb-box');
    const slider = document.getElementById('preview-scale');
    const btnSm = document.getElementById('preview-smaller');
    const btnBg = document.getElementById('preview-bigger');
    if(!box || !slider) return;
    // load saved size
    const saved = parseInt(localStorage.getItem('sb-preview-size') || '') || 14;
    slider.value = saved;
    box.style.setProperty('--sb-font-size', saved + 'px');
    // update preview-space so main content shrinks when preview grows
    const updatePreviewSpace = ()=>{
        // include some margin (controls + gap)
        const rect = box.getBoundingClientRect();
        const space = Math.round(rect.width + 32);
        document.documentElement.style.setProperty('--preview-space', space + 'px');
    };
    updatePreviewSpace();
    slider.addEventListener('input', ()=>{
        const v = slider.value;
        box.style.setProperty('--sb-font-size', v + 'px');
        localStorage.setItem('sb-preview-size', v);
        updatePreviewSpace();
    });
    btnSm.addEventListener('click', ()=>{
        let v = Math.max(parseInt(slider.min), parseInt(slider.value)-1);
        slider.value = v; slider.dispatchEvent(new Event('input'));
    });
    btnBg.addEventListener('click', ()=>{
        let v = Math.min(parseInt(slider.max), parseInt(slider.value)+1);
        slider.value = v; slider.dispatchEvent(new Event('input'));
    });
}

// update preview display
function updatePreview(){
    const previewTitle = document.getElementById('preview-title');
    const previewLines = document.getElementById('preview-lines');
    if(!previewTitle || !previewLines) return;
    const titleEl = document.getElementById('title');
    // Prefer rendering from MC-coded string so the preview matches in-game codes
    const rawTitleMC = titleEl ? serializeEditor(titleEl).trim() : '';
    const titleMC = ensureDefaultWhite(rawTitleMC) || '§fScoreboard';
    previewTitle.innerHTML = mcToHtml(titleMC);
    previewLines.innerHTML = '';
    const editors = [...document.querySelectorAll('#lines .editor-field')];
    if(editors.length===0){
        const div = document.createElement('div'); div.className='sb-line'; div.innerHTML='&nbsp;'; previewLines.appendChild(div);
        return;
    }
    editors.forEach((ed)=>{
        const div = document.createElement('div');
        div.className = 'sb-line';
        const textSpan = document.createElement('span');
        textSpan.className = 'sb-text';
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'sb-score';
        try{
            const raw = serializeEditor(ed) || '';
            const mc = ensureDefaultWhite(raw);
            textSpan.innerHTML = mcToHtml(mc) || '&nbsp;';
        }catch(e){ textSpan.textContent = stripMcCodes(ed.textContent || ''); }
        // show a simulated score to the right: higher lines -> higher score
        const index = editors.indexOf(ed);
        const simulatedScore = (editors.length - index);
        scoreSpan.textContent = simulatedScore;
        div.appendChild(textSpan);
        div.appendChild(scoreSpan);
        previewLines.appendChild(div);
    });
    // restart any preview magic animations for the new preview content
    stopAllPreviewMagic();
    startPreviewMagic(previewTitle);
    startPreviewMagic(previewLines);
}

// Convert the contenteditable editor's DOM into sanitized preview HTML preserving color/format styles
function editorContentsToPreviewHtml(root){
    // Walk the DOM and wrap element-level styles into spans so preview receives exact styling
    const walkNode = (node) => {
        if(node.nodeType === Node.TEXT_NODE){
            return escapeHtml(node.nodeValue || '');
        }
        if(node.nodeType === Node.ELEMENT_NODE){
                // compute styles for this element
            const style = window.getComputedStyle(node);
            const styles = [];
            if(style.color) styles.push(`color:${style.color}`);
            const weight = style.fontWeight;
            if(weight === 'bold' || parseInt(weight)>=600) styles.push('font-weight:700');
            if(style.fontStyle === 'italic') styles.push('font-style:italic');
            const dec = style.textDecorationLine || style.textDecoration;
            if(dec && dec.includes('underline')) styles.push('text-decoration:underline');
            if(dec && dec.includes('line-through')) styles.push('text-decoration:line-through');
            if((style.filter||'').includes('blur')) styles.push('filter:blur(1px)');

            // recurse children
            let inner = '';
            node.childNodes.forEach(c=> { inner += walkNode(c); });
            if(styles.length){
                return `<span style="${styles.join(';')}">${inner}</span>`;
            }
            return inner;
        }
        return '';
    };

    let result = '';
    root.childNodes.forEach(n=> { result += walkNode(n); });
    return result;
}

// Ensure MC string has a default white color if it contains no color codes
function ensureDefaultWhite(mcString){
    if(!mcString) return '§f';
    // if string contains any color code (§ + hex letter or §x sequence), consider it colored
    if(/§x(§[0-9A-Fa-f]){6}/.test(mcString) || /§[0-9A-Fa-f]/.test(mcString)) return mcString;
    // otherwise prepend white code
    return '§f' + mcString;
}

/* ================================================
   Rich editor: parse MC codes -> styled HTML, and
   serialize styled HTML -> MC codes for saving
================================================ */

const mcColorMap = {
    "#000000":"§0","#0000aa":"§1","#00aa00":"§2","#00aaaa":"§3",
    "#aa0000":"§4","#aa00aa":"§5","#ffaa00":"§6","#aaaaaa":"§7",
    "#555555":"§8","#5555ff":"§9","#55ff55":"§a","#55ffff":"§b",
    "#ff5555":"§c","#ff55ff":"§d","#ffff55":"§e","#ffffff":"§f"
};

// reverse map from code -> hex
const codeToHex = {};
Object.keys(mcColorMap).forEach(hex=>{ codeToHex[mcColorMap[hex].slice(1)] = hex; });

const stripMcCodes = text => (text||"")
    .replace(/§x(§[0-9A-Fa-f]){6}/g, "")
    .replace(/§[0-9A-FK-ORa-fk-or]/g, "");

const rgbToHex = rgb => {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
    return m ? ("#" + (+m[1]).toString(16).padStart(2,'0') + (+m[2]).toString(16).padStart(2,'0') + (+m[3]).toString(16).padStart(2,'0')) : null;
};

// Parse a string containing MC codes into HTML (returns innerHTML string)
function mcToHtml(text){
    if(!text) return '';
    const out = [];
    // maintain current state
    let state = {color:null,bold:false,italic:false,underline:false,strike:false,magic:false};

    const flushChar = (ch)=>{
        if(ch === '') return;
        let style = '';
        if(state.color) style += `color:${state.color};`;
        if(state.bold) style += 'font-weight:700;';
        if(state.italic) style += 'font-style:italic;';
        if(state.underline || state.strike){
            const decos = [];
            if(state.underline) decos.push('underline');
            if(state.strike) decos.push('line-through');
            style += `text-decoration:${decos.join(' ')};`;
            style += 'text-decoration-thickness:2px;';
            style += 'text-underline-offset:2px;';
        }
        // For magic codes, the preview should show rapidly changing characters rather than blur.
        if(state.magic){
            out.push(`<span class="mc-magic" data-original="${escapeAttr(ch)}" style="${style}">${escapeHtml(ch)}</span>`);
            return;
        }
        if(style) out.push(`<span style="${style}">${escapeHtml(ch)}</span>`);
        else out.push(escapeHtml(ch));
    };

    for(let i=0;i<text.length;i++){
        const ch = text[i];
        if(ch === '§'){
            const code = (text[i+1]||'').toLowerCase();
            if(code === 'x'){
                // hex sequence: §x§R§R§G§G§B§B
                const seq = text.substr(i,14); // length 14: § x §R §R §G §G §B §B
                const m = seq.match(/§x(§[0-9A-Fa-f]){6}/);
                if(m){
                    // extract hex digits
                    let hex='';
                    for(let j=i+2;j<i+14;j+=2){ hex += text[j]; }
                    state.color = '#'+hex;
                    i += 13; // advance
                    continue;
                }
            }

            // single char codes
            switch(code){
                case '0': state.color = '#000000'; break;
                case '1': state.color = '#0000aa'; break;
                case '2': state.color = '#00aa00'; break;
                case '3': state.color = '#00aaaa'; break;
                case '4': state.color = '#aa0000'; break;
                case '5': state.color = '#aa00aa'; break;
                case '6': state.color = '#ffaa00'; break;
                case '7': state.color = '#aaaaaa'; break;
                case '8': state.color = '#555555'; break;
                case '9': state.color = '#5555ff'; break;
                case 'a': state.color = '#55ff55'; break;
                case 'b': state.color = '#55ffff'; break;
                case 'c': state.color = '#ff5555'; break;
                case 'd': state.color = '#ff55ff'; break;
                case 'e': state.color = '#ffff55'; break;
                case 'f': state.color = '#ffffff'; break;
                case 'l': state.bold = true; break;
                case 'o': state.italic = true; break;
                case 'n': state.underline = true; break;
                case 'm': state.strike = true; break;
                case 'k': state.magic = true; break;
                case 'r': state = {color:null,bold:false,italic:false,underline:false,strike:false,magic:false}; break;
                default: break;
            }
            i++; // skip code char
            continue;
        }
        // normal char
        flushChar(ch);
    }
    return out.join('');
}

function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttr(s){
    return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Serialize an editor (contenteditable) back to MC-coded string
function serializeEditor(editor){
    const segments = [];

    const hasDecorationInChain = (el, token) => {
        let cur = el;
        while (cur && cur !== editor && cur.nodeType === Node.ELEMENT_NODE) {
            const tag = (cur.tagName || '').toLowerCase();
            if (token === 'underline' && (tag === 'u' || tag === 'ins')) return true;
            if (token === 'line-through' && (tag === 's' || tag === 'strike' || tag === 'del')) return true;

            const dec = (cur.style && (cur.style.textDecorationLine || cur.style.textDecoration)) || '';
            if (dec && dec.includes(token)) return true;

            const cs = window.getComputedStyle(cur);
            const cdec = (cs.textDecorationLine || cs.textDecoration || '');
            if (cdec.includes(token)) return true;

            cur = cur.parentElement;
        }
        return false;
    };

    const hasMagicInChain = (el) => {
        let cur = el;
        while (cur && cur !== editor && cur.nodeType === Node.ELEMENT_NODE) {
            if ((cur.getAttribute && cur.getAttribute('data-magic')) || (cur.classList && cur.classList.contains('mc-magic-editor'))) {
                return true;
            }
            const cs = window.getComputedStyle(cur);
            if ((cs.filter || '').includes('blur')) return true;
            cur = cur.parentElement;
        }
        return false;
    };

    const styleOf = (el) => {
        const style = window.getComputedStyle(el || editor);
        const hex = rgbToHex(style.color);
        const mcColor = hex ? mcColorMap[hex.toLowerCase()] || null : null;
        const weight = style.fontWeight;
        const dec = style.textDecorationLine || style.textDecoration || '';
        return {
            color: mcColor,
            bold: (weight === 'bold' || parseInt(weight, 10) >= 600),
            italic: style.fontStyle === 'italic',
            underline: dec.includes('underline') || hasDecorationInChain(el, 'underline'),
            strike: dec.includes('line-through') || hasDecorationInChain(el, 'line-through'),
            magic: (style.filter || '').includes('blur') || hasMagicInChain(el)
        };
    };

    const sameStyle = (a, b) =>
        a.color === b.color &&
        a.bold === b.bold &&
        a.italic === b.italic &&
        a.underline === b.underline &&
        a.strike === b.strike &&
        a.magic === b.magic;

    const appendSegment = (text, style) => {
        if(!text) return;
        const last = segments[segments.length - 1];
        if(last && sameStyle(last.style, style)){
            last.text += text;
        } else {
            segments.push({ text, style });
        }
    };

    const walk = (node, parentEl) => {
        if(node.nodeType === Node.TEXT_NODE){
            const el = parentEl || node.parentElement || editor;
            let text = node.nodeValue || '';

            // If this text node is inside a per-character magic span, preserve original char.
            if(el && el.classList && el.classList.contains('mc-magic-editor')){
                const orig = el.getAttribute && el.getAttribute('data-original');
                if(orig !== null && orig !== undefined) text = orig;
            }

            if(!text) return;
            const st = styleOf(el);

            // Explicit magic wrapper markers should force magic style on the run.
            if(el && el.getAttribute && el.getAttribute('data-magic')) st.magic = true;
            if(el && el.classList && el.classList.contains('mc-magic-editor')) st.magic = true;

            appendSegment(text, st);
            return;
        }

        if(node.nodeType === Node.ELEMENT_NODE){
            node.childNodes.forEach(c => walk(c, node));
            return;
        }

        node.childNodes && node.childNodes.forEach(c => walk(c, parentEl));
    };

    editor.childNodes.forEach(n => walk(n, editor));
    if(segments.length === 0) return '';

    const hasAnyFormat = (s) => s.bold || s.italic || s.underline || s.strike || s.magic;
    const active = { color: null, bold: false, italic: false, underline: false, strike: false, magic: false };
    let out = '';

    const emitFormats = (s) => {
        if(s.bold) out += '§l';
        if(s.italic) out += '§o';
        if(s.underline) out += '§n';
        if(s.strike) out += '§m';
        if(s.magic) out += '§k';
    };

    for(const seg of segments){
        const s = seg.style;

        // If formatting gets removed, reset once and rebuild state (efficient, not per character).
        const removedFormat =
            (active.bold && !s.bold) ||
            (active.italic && !s.italic) ||
            (active.underline && !s.underline) ||
            (active.strike && !s.strike) ||
            (active.magic && !s.magic);

        if(removedFormat || (active.color && !s.color)){
            out += '§r';
            active.color = null;
            active.bold = false;
            active.italic = false;
            active.underline = false;
            active.strike = false;
            active.magic = false;
        }

        if(s.color && s.color !== active.color){
            out += s.color;
            active.color = s.color;
            // color code resets previous effects in Minecraft, so re-emit current effects for this run
            emitFormats(s);
            active.bold = s.bold;
            active.italic = s.italic;
            active.underline = s.underline;
            active.strike = s.strike;
            active.magic = s.magic;
        } else {
            if(s.bold && !active.bold){ out += '§l'; active.bold = true; }
            if(s.italic && !active.italic){ out += '§o'; active.italic = true; }
            if(s.underline && !active.underline){ out += '§n'; active.underline = true; }
            if(s.strike && !active.strike){ out += '§m'; active.strike = true; }
            if(s.magic && !active.magic){ out += '§k'; active.magic = true; }
            if(!active.color && s.color){
                out += s.color;
                active.color = s.color;
            }
        }

        out += seg.text;
    }

    // Final normalization pass removes redundant effect codes and unnecessary resets.
    return compactMcFormatting(out);
}

function compactMcFormatting(input){
    if(!input) return '';

    const isColor = c => /[0-9a-f]/.test(c);
    const isEffect = c => /[klmno]/.test(c);
    const resetState = () => ({ color:null, k:false, l:false, m:false, n:false, o:false });

    let state = resetState();
    let out = '';

    for(let i = 0; i < input.length; i++){
        const ch = input[i];
        if(ch !== '§' || i + 1 >= input.length){
            out += ch;
            continue;
        }

        const code = input[i + 1].toLowerCase();
        i++;

        if(code === 'r'){
            // Only emit reset if there is active formatting to reset.
            if(state.color !== null || state.k || state.l || state.m || state.n || state.o){
                out += '§r';
                state = resetState();
            }
            continue;
        }

        if(isColor(code)){
            // Color code resets effects; only emit when it changes or effects are active.
            const needsColor = state.color !== code || state.k || state.l || state.m || state.n || state.o;
            if(needsColor){
                out += '§' + code;
                state = resetState();
                state.color = code;
            }
            continue;
        }

        if(isEffect(code)){
            if(!state[code]){
                out += '§' + code;
                state[code] = true;
            }
            continue;
        }

        // Preserve any unknown formatting codes as-is.
        out += '§' + code;
    }

    return out;
}

let activeEditor = null;
document.addEventListener('focusin', e=>{
    if(e.target && e.target.classList && e.target.classList.contains('editor-field')) activeEditor = e.target;
});

// toolbar behavior scoped to a wrapper
function setupToolbar(toolbar){
    const wrapper = toolbar.closest('.card') || toolbar.closest('.line-row') || toolbar.closest('#title-wrapper');
    // prefer the editor within the same wrapper; when toolbar is the global top toolbar, only title exists within its wrapper
    let editor = null;
    // For title, toolbar is in same section; we'll rely on focusing to determine the editor

    toolbar.querySelectorAll('button').forEach(btn=> btn.addEventListener('mousedown', e=> e.preventDefault()));

    toolbar.querySelectorAll('.color-swatch').forEach(s=> s.addEventListener('click', ()=>{
        const code = s.dataset.code;
        const target = activeEditor || document.getElementById('title');
        if(!target) return;
        // apply color to current selection in activeEditor
        // apply color to current selection in activeEditor
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('foreColor', false, codeToCss(code));
        // update outline on the editor after applying a color — defer so computed style reflects the change
        setTimeout(()=> applyEditorOutline(target), 0);
        setTimeout(()=> scheduleAutoSave(), 0);
    }));

    toolbar.querySelectorAll('.eff-btn').forEach(b=> b.addEventListener('click', ()=>{
        const code = b.dataset.code;
        const target = activeEditor || document.getElementById('title');
        if(!target) return;
        switch(code){
            case '§l': document.execCommand('bold'); scheduleAutoSave(); break;
            case '§o': document.execCommand('italic'); scheduleAutoSave(); break;
            case '§n': document.execCommand('underline'); scheduleAutoSave(); break;
            case '§m': document.execCommand('strikeThrough'); scheduleAutoSave(); break;
            case '§k': toggleMagic(); scheduleAutoSave(); break;
            case '§r': // reset – remove inline styles in selection and stop/unwrap any magic
                // Remove formatting from selection
                document.execCommand('removeFormat');
                // visual feedback
                b.classList.add('spin');
                setTimeout(()=> b.classList.remove('spin'), 800);
                // apply outline update after DOM changes take effect
                setTimeout(()=> applyEditorOutline(target), 0);
                // stop any editor-side magic animations and restore original characters immediately
                setTimeout(()=>{
                    try{ stopEditorMagic(target); }catch(e){}
                    try{ unwrapDataMagicWrappers(target); }catch(e){}
                    try{ stopAllPreviewMagic(); }catch(e){}
                    try{ updatePreview(); }catch(e){}
                    try{ scheduleAutoSave(); }catch(e){}
                }, 0);
                break;
        }
    }));
}

function codeToCss(code){
    // code is like '§a' — return a CSS color string
    if(!code) return null;
    const c = code[1].toLowerCase();
    const map = {
        '0':'#000000','1':'#0000aa','2':'#00aa00','3':'#00aaaa','4':'#aa0000','5':'#aa00aa','6':'#ffaa00','7':'#aaaaaa',
        '8':'#555555','9':'#5555ff','a':'#55ff55','b':'#55ffff','c':'#ff5555','d':'#ff55ff','e':'#ffff55','f':'#ffffff'
    };
    return map[c] || null;
}

function toggleMagic(){
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // If the active editor already contains per-character magic spans, treat this as a global toggle-off
    // and restore the original text immediately (do not leave last-random characters behind).
    if(activeEditor && activeEditor.querySelectorAll('.mc-magic-editor').length > 0){
        stopEditorMagic(activeEditor);
        unwrapDataMagicWrappers(activeEditor);
        updatePreview();
        scheduleAutoSave();
        return;
    }
    // If selection contains existing magic spans, unwrap them (toggle off)
    let unwrappedAny = false;
    const existing = [...(activeEditor?.querySelectorAll('span[data-magic], .mc-magic-editor')||[])];
    for(const s of existing){
        if(range.intersectsNode(s)){
            // if this is an editor magic span or a wrapped char, restore original
            if(s.classList && s.classList.contains('mc-magic-editor')){
                const orig = s.getAttribute('data-original') || s.textContent || '';
                s.replaceWith(document.createTextNode(orig));
                unwrappedAny = true;
            } else if(s.getAttribute && s.getAttribute('data-magic')){
                // replace whole data-magic span with its text content
                // also ensure any mc-magic in the preview will be restored on next update
                s.replaceWith(document.createTextNode(s.textContent));
                unwrappedAny = true;
            }
        }
    }
    // After unwrapping, stop editor magic for this editor if there are no more mc-magic-editor spans
    if(activeEditor && activeEditor.querySelectorAll('.mc-magic-editor').length === 0){
        stopEditorMagic(activeEditor);
        unwrapDataMagicWrappers(activeEditor);
    }
    // If we just toggled existing magic off, do not immediately wrap again.
    if(unwrappedAny){
        updatePreview();
        scheduleAutoSave();
        return;
    }

    // Otherwise, wrap selection into a data-magic span and then split into per-character spans for animation
    const span = document.createElement('span');
    span.setAttribute('data-magic','true');
    // insert extracted contents into span temporarily
    const contents = range.extractContents();
    span.appendChild(contents);
    // Now convert each text node inside span into individual character spans
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while(walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(tn=>{
        const txt = tn.nodeValue || '';
        const frag = document.createDocumentFragment();
        for(const ch of txt){
            const cspan = document.createElement('span');
            cspan.className = 'mc-magic-editor';
            cspan.setAttribute('data-original', ch);
            cspan.textContent = ch;
            frag.appendChild(cspan);
        }
        tn.replaceWith(frag);
    });
    // insert the new complex span back into the range
    range.insertNode(span);
    // start animation for the containing editor
    const editorRoot = activeEditor || span.closest('.editor-field') || document.getElementById('title');
    startEditorMagic(editorRoot);
    // update preview so newly-magic text appears obfuscated there as well
    updatePreview();
}

// Apply or toggle rainbow color on the current selection (editor). Wrap selection in
// a span.mc-rainbow-editor so the editor shows animated rainbow text. Toggling off
// restores original text.
/* Rainbow option removed: applyRainbowToSelection() deleted */

// --- Magic animation managers ---
// Separate timer maps for preview and editor so they can be managed independently
const _previewMagicTimers = new Map();
const _editorMagicTimers = new Map();

function stopAllPreviewMagic(){
    for(const [el, id] of _previewMagicTimers.entries()){
        clearInterval(id);
        try{
            const orig = el.getAttribute && el.getAttribute('data-original');
            if(orig !== null && orig !== undefined) el.textContent = orig;
        }catch(e){}
    }
    _previewMagicTimers.clear();
    // also ensure any remaining .mc-magic elements in the preview are restored to their original text
    try{
        document.querySelectorAll('#sb-preview .mc-magic').forEach(el=>{
            try{
                const o = el.getAttribute && el.getAttribute('data-original');
                if(o !== null && o !== undefined) el.textContent = o;
            }catch(e){}
        });
    }catch(e){}
}

function stopEditorMagic(editor){
    if(!editor) return;
    const id = _editorMagicTimers.get(editor);
    if(id){ clearInterval(id); _editorMagicTimers.delete(editor); }
    // restore original characters for any remaining mc-magic-editor spans
    editor.querySelectorAll('.mc-magic-editor').forEach(s=>{
        const orig = s.getAttribute('data-original') || s.textContent || '';
        const txt = document.createTextNode(orig);
        s.replaceWith(txt);
    });
}

// Unwrap any wrapper spans with data-magic="true" inside the editor by replacing them with their text content
function unwrapDataMagicWrappers(editor){
    if(!editor) return;
    const wrappers = [...editor.querySelectorAll('span[data-magic]')];
    wrappers.forEach(w=>{
        try{
            const txt = document.createTextNode(w.textContent || '');
            w.replaceWith(txt);
        }catch(e){}
    });
}

function randomObfCharFromFontpack(){
    // Use a wide range of characters to better approximate the font glyph set
    const parts = [];
    // printable ASCII
    for(let i=33;i<127;i++) parts.push(String.fromCharCode(i));
    // Latin-1 Supplement block (¡ - ÿ)
    for(let i=161;i<256;i++) parts.push(String.fromCharCode(i));
    const chars = parts.join('');
    return chars.charAt(Math.floor(Math.random()*chars.length));
}

function startPreviewMagic(root){
    if(!root) return;
    const els = root.querySelectorAll('.mc-magic');
    els.forEach(el=>{
        if(_previewMagicTimers.has(el)) return;
        const orig = el.getAttribute('data-original') || el.textContent || '';
        const len = Math.max(1, orig.length);
        const id = setInterval(()=>{
            let s = '';
            for(let i=0;i<len;i++) s += randomObfCharFromFontpack();
            el.textContent = s;
        }, 40);
        _previewMagicTimers.set(el, id);
    });
}

function startEditorMagic(editor){
    if(!editor) return;
    // avoid creating multiple timers for same editor
    if(_editorMagicTimers.has(editor)) return;
    const els = editor.querySelectorAll('.mc-magic-editor');
    if(els.length === 0) return;
    // interval updates all mc-magic-editor spans inside this editor
    const id = setInterval(()=>{
        els.forEach(s=>{
            // replace with a single random character from fontpack
            s.textContent = randomObfCharFromFontpack();
        });
    }, 40);
    _editorMagicTimers.set(editor, id);
}
