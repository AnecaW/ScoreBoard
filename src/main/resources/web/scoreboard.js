const {applyEditorOutline,attachDefaultWhiteBehavior,mcToHtml,serializeEditor,compactMcFormatting,setupToolbar,stopEditorMagic,stopAllPreviewMagic,startPreviewMagic,startEditorMagic,stripMcCodes,escapeHtml,escapeAttr,codeToCss,unwrapDataMagicWrappers}=MinecraftTextEditor;
MinecraftTextEditor.setDefaults({change:()=>scheduleAutoSave(),preview:()=>updatePreview()});
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
        lines: ['§7Welkom!', '§fOnline: §a%server_online%', '§fHave fun!']
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
    const rows=[...document.querySelectorAll('#lines .line-row')];
    page.lines=rows.map(row=>serializeEditor(row.querySelector('.editor-field')));
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
    if(document.querySelectorAll("#lines .line-row").length>=15){document.getElementById("status").textContent="Maximaal 15 regels per scoreboard";return;}
    const wrapper = document.createElement('div');
    wrapper.className = 'line-row';

    // toolbar + editor + remove
    wrapper.innerHTML = MinecraftTextEditor.lineTemplate;

    const lines = document.getElementById('lines');
    lines.appendChild(wrapper);

    // set content (parse MC codes into styled HTML)
    const editor = wrapper.querySelector('.editor-field');
    editor.innerHTML = mcToHtml(value || '');
    installRightAlignButton(wrapper,editor);
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
            payload.set(`page.${i}.preserveBlankLines`,'true');
        });

        const res = await fetch('/api/modules/' + encodeURIComponent(moduleId) + '/scoreboard/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: payload.toString()
        });

        if (!res.ok){const detail=await res.text();throw new Error(detail.trim().startsWith('<')?'HTTP '+res.status+' '+res.statusText:detail||res.statusText||'Save failed');}
        status.textContent = 'Opgeslagen';
        setTimeout(()=> status.textContent = '', 1800);
    } catch (err) {
        status.textContent = 'Fout bij opslaan: '+err.message+' — wijzigingen behouden';
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
                lines: Array.isArray(p.lines) ? p.lines : [],
                
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
    for(const id of ['samplePlayer','sampleOnline'])document.getElementById(id).addEventListener('input',updatePreview);
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
});

// Apply outline around editor text when color is exactly white or black.
// Apply outline around editor text by sampling the effective text color inside the editor.
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
const RIGHT_MARKER='{right}';
function markerElement(){const marker=document.createElement('span');marker.dataset.rightMarker='true';marker.contentEditable='false';marker.className='right-marker';marker.textContent='⇥';marker.title='Everything after this marker is right-aligned';return marker;}
function installRightAlignButton(row,editor){
    const button=document.createElement('button');button.type='button';button.textContent='Right align';button.title='Everything after the cursor will be right-aligned';
    button.onmousedown=event=>event.preventDefault();
    button.onclick=()=>{
        const selection=window.getSelection();
        if(!selection?.rangeCount)return;
        const range=selection.getRangeAt(0).cloneRange();
        if(!editor.contains(range.startContainer)||!editor.contains(range.endContainer)){document.getElementById('status').textContent='Place the cursor inside this line first';return;}
        if(serializeEditor(editor).includes(RIGHT_MARKER)){document.getElementById('status').textContent='This line already has a Right align marker; remove it before inserting another';return;}
        // Insert at the start of a selection without deleting its contents.
        range.collapse(true);const marker=markerElement();range.insertNode(marker);range.setStartAfter(marker);range.collapse(true);
        editor.focus();selection.removeAllRanges();selection.addRange(range);updatePreview();scheduleAutoSave();
    };
    row.querySelector('.toolbar').append(button);
}
function updatePreview(){
    const title=document.getElementById('preview-title'),list=document.getElementById('preview-lines');if(!title||!list)return;
    const sample=text=>text.replaceAll('%player_name%',document.getElementById('samplePlayer')?.value||'ExamplePlayer').replaceAll('%server_online%',document.getElementById('sampleOnline')?.value||'12').replaceAll('%player_ping%','42');
    title.innerHTML=mcToHtml(ensureDefaultWhite(sample(serializeEditor(document.getElementById('title')).trim()).replaceAll(RIGHT_MARKER,''))||'§fScoreboard');list.replaceChildren();
    const editors=[...document.querySelectorAll('#lines .editor-field')];
    editors.forEach((editor,i)=>{
        const text=sample(serializeEditor(editor)),index=text.indexOf(RIGHT_MARKER),left=index<0?text:text.slice(0,index),right=index<0?null:text.slice(index+RIGHT_MARKER.length).replaceAll(RIGHT_MARKER,'');
        const row=document.createElement('div');row.className='sb-line';const area=document.createElement('span');area.className='sb-text';area.innerHTML=mcToHtml(ensureDefaultWhite(left));row.append(area);
        const score=document.createElement('span');score.className=right===null?'sb-score':'sb-right';
        // Parse the combined string so formatting active before the marker carries into the right column.
        if(right===null)score.textContent=editors.length-i;else {const parsed=document.createElement('span');parsed.innerHTML=mcToHtml(left+RIGHT_MARKER+right);const marker=parsed.querySelector('[data-right-marker]');while(marker?.nextSibling)score.append(marker.nextSibling);}
        row.append(score);list.append(row);
    });
    stopAllPreviewMagic();startPreviewMagic(title);startPreviewMagic(list);
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

