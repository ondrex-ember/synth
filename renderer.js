// ==========================================
// SYSTEMIC SYNTHESIS — RENDERER v1.6
//
// Nové v v1.6:
//   - Node status badge (DORMANT / PARSING X/Y / ACTIVE)
//   - Parser progress feedback (zaskrtava filtry v sekvenci)
//   - Aktivni linka bliká amber při výběru
//   - Onboarding hint pro první tah
//   - Extraction fill circle (základ pro fragment mechanic)
// ==========================================

const layoutData = {
    "N01": { x: 340, y: 130 }, "N02": { x: 340, y: 280 },
    "N03": { x: 340, y: 430 }, "N04": { x: 340, y: 580 },
    "N05": { x: 520, y: 200 }, "N06": { x: 520, y: 430 },
    "N07": { x: 520, y: 580 }, "N08": { x: 700, y: 200 },
    "N09": { x: 700, y: 380 }, "N10": { x: 700, y: 530 },
    "N11": { x: 880, y: 280 }, "N12": { x: 880, y: 480 },
    "N13": { x: 1060, y: 130 },"N14": { x: 1060, y: 380 },
    "N15": { x: 1060, y: 580 }
};

// ── EVENT LOG ─────────────────────────────────────────────────────────────────
const LOG_MAX    = 14;
const logEntries = [];
const logCounts  = {};     // msg -> { div, count, type }
const rotWarned  = {};     // per-node threshold flags
const rotPrevious = {};    // per-node last logged rot value
const ROT_DELTA_LOG = 8;   // log rot change if delta >= this %

function logEvent(msg, type, rotVal) {
    const el = document.getElementById('event-log');
    if (!el) return;

    const now = new Date();
    const ts  = String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');

    const div = document.createElement('div');
    div.className = `log-entry ${type || 'info'}`;

    // Rot bar
    const barWrap = document.createElement('div');
    barWrap.className = 'log-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'log-bar';
    bar.style.width = rotVal != null ? Math.min(100, rotVal) + '%' : '15%';
    barWrap.appendChild(bar);
    div.appendChild(barWrap);

    // Text
    const span = document.createElement('span');
    span.className = 'log-text';
    span.textContent = `${ts}  ${msg}`;
    div.appendChild(span);

    el.appendChild(div);

    // Flash bright on entry
    requestAnimationFrame(() => {
        div.classList.add('visible');
        div.style.filter = 'brightness(2)';
        setTimeout(() => { div.style.filter = 'brightness(1)'; div.style.transition = 'filter 0.5s'; }, 50);
    });

    logEntries.push({ div });

    while (logEntries.length > LOG_MAX) {
        const old = logEntries.shift();
        old.div.classList.remove('visible');
        old.div.classList.add('fading');
        setTimeout(() => old.div.remove(), 400);
    }

    refreshOpacities();

}

function refreshOpacities() {
    logEntries.forEach((e, i) => {
        const age = logEntries.length - 1 - i;
        e.div.style.opacity = Math.max(0.07, 1 - age * 0.10).toFixed(2);
    });
}

function clearLog() {
    logEntries.forEach(e => e.div.remove());
    logEntries.length = 0;
    Object.keys(logCounts).forEach(k => delete logCounts[k]);
    Object.keys(rotWarned).forEach(k => delete rotWarned[k]);
    Object.keys(rotPrevious).forEach(k => delete rotPrevious[k]);
}



// ── FILTER WHISPERER ─────────────────────────────────────────────────────────
const FILTER_META = {
    'EXTRACT':     { hint: 'geography · resources',  era: 'I'   },
    'SUBJUGATE':   { hint: 'human · coerced nodes',  era: 'I'   },
    'COMMODIFY':   { hint: 'any → economic flow',    era: 'II'  },
    'EXTERNALIZE': { hint: 'clean local · dump rot',  era: 'II'  },
    'RATIONALIZE': { hint: 'hide rot · fragile',     era: 'II'  },
    'OBFUSCATE':   { hint: 'hide from dashboard',    era: 'III' },
    'SYNTHESIZE':  { hint: 'merge contradictions',   era: 'III' },
};

const ALL_FILTERS = Object.keys(FILTER_META);
let whisperSelected = -1;
let whisperItems    = [];

function getRequiredFilters() {
    if (!activeConnId || !State.connections[activeConnId]) return [];
    const conn = State.connections[activeConnId];
    if (conn.status === 'ACTIVE') return [];
    // Next required filter(s) in sequence
    const nextIdx = conn.appliedFilters.length;
    return conn.requiredLogic.slice(nextIdx);
}

function showWhisper(query) {
    const el = document.getElementById('filter-whisper');
    if (!el) return;

    const q        = query.toUpperCase().trim();
    const required = getRequiredFilters();
    const nextReq  = required[0] || null;

    // Filter list: matches query, sorted — required first
    const matches = ALL_FILTERS
        .filter(f => !q || f.startsWith(q))
        .sort((a, b) => {
            const aReq = required.includes(a) ? 0 : 1;
            const bReq = required.includes(b) ? 0 : 1;
            return aReq - bReq || a.localeCompare(b);
        });

    if (matches.length === 0) {
        hideWhisper();
        return;
    }

    el.innerHTML = '';
    whisperItems  = [];
    whisperSelected = -1;

    matches.forEach((f, i) => {
        const meta      = FILTER_META[f];
        const isReq     = required.includes(f);
        const isNext    = f === nextReq;

        const div = document.createElement('div');
        div.className = 'whisper-item' + (isReq ? ' required-match' : '');

        const left = document.createElement('span');
        left.className = 'w-filter';
        left.textContent = '[' + f + ']';

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.alignItems = 'flex-end';
        right.style.gap = '1px';

        const hint = document.createElement('span');
        hint.className = 'w-hint';
        hint.textContent = meta.hint + '  Era ' + meta.era;

        right.appendChild(hint);

        if (isNext) {
            const req = document.createElement('span');
            req.className = 'w-required';
            req.textContent = '← NEXT REQUIRED';
            right.appendChild(req);
        }

        div.appendChild(left);
        div.appendChild(right);

        div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectWhisperItem(f);
        });

        el.appendChild(div);
        whisperItems.push({ div, filter: f });
    });

    el.style.display = 'block';
}

function hideWhisper() {
    const el = document.getElementById('filter-whisper');
    if (el) el.style.display = 'none';
    whisperItems    = [];
    whisperSelected = -1;
}

function selectWhisperItem(filterWord) {
    const input = document.getElementById('parser-input');
    if (input) {
        input.value = filterWord;
        input.focus();
        // Trigger Enter
        const evt = new KeyboardEvent('keypress', { key: 'Enter', bubbles: true });
        input.dispatchEvent(evt);
    }
    hideWhisper();
}

function navigateWhisper(dir) {
    if (whisperItems.length === 0) return false;
    whisperSelected = Math.max(0, Math.min(whisperItems.length - 1, whisperSelected + dir));
    whisperItems.forEach((item, i) => {
        item.div.classList.toggle('selected', i === whisperSelected);
    });
    return true;
}

const board   = document.getElementById('game-board');
const uiLayer = document.getElementById('ui-layer');
const svgNS   = "http://www.w3.org/2000/svg";
const svg     = document.createElementNS(svgNS, "svg");
svg.setAttribute("width", "100%");
svg.setAttribute("height", "100%");
board.appendChild(svg);

const linkLayer = document.createElementNS(svgNS, "g");
const nodeLayer = document.createElementNS(svgNS, "g");
svg.appendChild(linkLayer);
svg.appendChild(nodeLayer);

const tempLine = document.createElementNS(svgNS, "line");
tempLine.setAttribute("stroke", "#00ff00");
tempLine.setAttribute("stroke-width", "2");
tempLine.setAttribute("stroke-dasharray", "5,5");
tempLine.style.display = "none";
svg.appendChild(tempLine);

let draggedNodeId = null;
let linkingNodeId = null;
let activeConnId  = null;
let firstAction   = true;

const visualNodes = {};
const visualLinks = {};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function makeText(y, size, color, anchor) {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("y", y);
    t.setAttribute("fill", color || "#d0d0d0");
    t.setAttribute("font-family", "monospace");
    t.setAttribute("font-size", size || "11px");
    t.setAttribute("text-anchor", anchor || "middle");
    return t;
}


// ── NODE MODAL ────────────────────────────────────────────────────────────────
function openNodeModal(nodeId) {
    const node  = nodeDatabase.find(n => n.node_id === nodeId);
    if (!node) return;

    const state  = State.nodes[nodeId] || { ownRot: 0, totalRot: 0 };
    const rotPct = state.totalRot;

    // Rot bar color
    let rotColor = '#5a8a5a';
    if      (rotPct >= 75) rotColor = '#cc3333';
    else if (rotPct >= 50) rotColor = '#c87820';
    else if (rotPct >= 25) rotColor = '#8a6a20';

    // Stat value class
    const rotClass = rotPct >= 75 ? 'hot' : rotPct >= 50 ? 'warm' : 'ok';

    // Characteristics rows
    const chars = (node.characteristics || []).map(c =>
        `<div class="nm-char-row">
            <span class="nm-char-label">${c.label}</span>
            <span class="nm-char-value">${c.value}</span>
        </div>`
    ).join('');

    // Irreducible warning
    const irreducible = node.irreducible
        ? `<div class="nm-irreducible">SYS_LOCK: EXTRACTION BASELINE &mdash; MINIMUM VIABLE FRICTION UNRESOLVABLE<br>
           This node cannot be normalized. Rot floor is permanent and hardcoded.</div>`
        : '';

    // Active connections
    const incoming = Object.values(State.connections).filter(c => c.target === nodeId);
    const outgoing = Object.values(State.connections).filter(c => c.source === nodeId);
    const connText = [
        ...incoming.map(c => `&larr; ${c.source} (${c.status})`),
        ...outgoing.map(c => `&rarr; ${c.target} (${c.status})`)
    ].join('<br>') || 'No active connections';

    const html = `
        <div class="nm-id">${node.node_id} &nbsp;&middot;&nbsp; ${node.era || 'ERA_III'} &nbsp;&middot;&nbsp; ${node.period || ''}</div>
        <div class="nm-title">${node.node_title}</div>
        <div class="nm-type">${node.node_type.replace(/_/g,' ')} &nbsp;&middot;&nbsp; ${(node.data_profile||[]).join(' &middot; ')}</div>

        <div class="nm-rot-bar-wrap">
            <div class="nm-rot-bar" style="width:${rotPct}%;background:${rotColor};"></div>
        </div>

        ${irreducible}

        <div class="nm-stats">
            <div class="nm-stat">
                <div class="nm-stat-label">CURRENT ROT</div>
                <div class="nm-stat-value ${rotClass}">${rotPct.toFixed(1)}%</div>
            </div>
            <div class="nm-stat">
                <div class="nm-stat-label">ROT FLOOR</div>
                <div class="nm-stat-value ${node.minimum_rot_floor > 30 ? 'hot' : node.minimum_rot_floor > 10 ? 'warm' : 'ok'}">${node.minimum_rot_floor}%</div>
            </div>
            <div class="nm-stat">
                <div class="nm-stat-label">DECAY RATE</div>
                <div class="nm-stat-value">${node.age_multiplier > 0 ? '+' + (node.age_multiplier * 100).toFixed(1) + '%/cycle' : 'static'}</div>
            </div>
        </div>

        <div class="nm-section-title">Analysis</div>
        <div class="nm-description">${node.description || 'No description available.'}</div>

        ${chars ? `<div class="nm-section-title">Characteristics</div><div class="nm-chars">${chars}</div>` : ''}

        <div class="nm-section-title">Connections</div>
        <div class="nm-chars"><div class="nm-char-row"><span class="nm-char-value" style="font-size:10px;">${connText}</span></div></div>

        <div class="nm-source">Source: ${node.source || 'Archive reference not available'}</div>
    `;

    document.getElementById('node-modal-content').innerHTML = html;
    document.getElementById('node-modal').classList.add('open');
    engine.setTimeMode('pause');
    updateTimeModeUI('pause');
}

window.closeNodeModal = function(e) {
    if (e && e.target !== document.getElementById('node-modal') &&
        !document.getElementById('node-modal-close').contains(e.target)) return;
    document.getElementById('node-modal').classList.remove('open');
    engine.setTimeMode('live');
    updateTimeModeUI('live');
};

// ESC closes modal
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        document.getElementById('node-modal').classList.remove('open');
        engine.setTimeMode('live');
        updateTimeModeUI('live');
    }
});


// ── FRAGMENT MODAL ────────────────────────────────────────────────────────────
const shownFragments   = new Set();    // Které fragmenty už byly zobrazeny
const libraryFragments = [];            // Chronologický seznam extrahovaných fragmentů

function addToLibrary(node) {
    if (!node || !node.fragment) return;
    libraryFragments.push(node);

    const entries = document.getElementById('lib-entries');
    const count   = document.getElementById('lib-count');
    const toggle  = document.getElementById('lib-toggle');
    if (!entries) return;

    if (count) count.textContent = libraryFragments.length + ' / ' + nodeDatabase.length;

    // Show ARCHIVE tab after first fragment
    if (toggle && libraryFragments.length === 1) toggle.classList.add('has-items');

    const preview = (node.fragment.text || '').slice(0, 60) +
                    (node.fragment.text.length > 60 ? '…' : '');

    const div = document.createElement('div');
    div.className = 'lib-entry';
    div.innerHTML = `
        <div class="lib-entry-id">${node.node_id} &nbsp;·&nbsp; ${node.era || 'ERA_III'}</div>
        <div class="lib-entry-title">${node.node_title}</div>
        <div class="lib-entry-preview">${preview}</div>
        <div class="lib-entry-date">${node.fragment.meta_date || ''} &nbsp;·&nbsp; ${node.fragment.meta_location || ''}</div>
    `;
    div.addEventListener('click', () => replayFragment(node.node_id));
    entries.appendChild(div);
}

function replayFragment(nodeId) {
    const node = nodeDatabase.find(n => n.node_id === nodeId);
    if (!node || !node.fragment) return;

    const modal = document.getElementById('fragment-modal');
    if (!modal) return;

    engine.setTimeMode('pause');
    updateTimeModeUI('pause');

    document.getElementById('fragment-node-id').textContent =
        node.node_id + '  ·  ' + (node.node_title || '') + '  ·  ' + (node.era || 'ERA_III');

    const textEl = document.getElementById('fragment-text');
    textEl.textContent = node.fragment.text || '';
    textEl.classList.remove('revealed');

    document.getElementById('fragment-date').textContent     = node.fragment.meta_date || '';
    document.getElementById('fragment-location').textContent = node.fragment.meta_location || '';
    document.getElementById('fragment-source').textContent   = '— ' + (node.fragment.meta_source || '');

    document.getElementById('fragment-counter').textContent =
        'FRAGMENT ' + shownFragments.size + ' / ' + nodeDatabase.length;

    const warning = document.getElementById('fragment-rot-warning');
    if (warning) warning.style.display = 'none';

    modal.classList.add('open');
    setTimeout(() => textEl.classList.add('revealed'), 200);
}

function showFragment(nodeId) {
    const node = nodeDatabase.find(n => n.node_id === nodeId);
    if (!node || !node.fragment) return;
    if (shownFragments.has(nodeId)) return;

    const modal = document.getElementById('fragment-modal');
    if (!modal) return;

    // Mark as shown AFTER we confirm modal exists
    shownFragments.add(nodeId);
    addToLibrary(node);

    // Pauza gridu
    engine.setTimeMode('pause');
    updateTimeModeUI('pause');

    // Naplnit obsah
    document.getElementById('fragment-node-id').textContent =
        node.node_id + '  ·  ' + (node.node_title || '') + '  ·  ' + (node.era || 'ERA_III');

    const textEl = document.getElementById('fragment-text');
    textEl.textContent = node.fragment.text || '';
    textEl.classList.remove('revealed');

    document.getElementById('fragment-date').textContent =
        node.fragment.meta_date || '';
    document.getElementById('fragment-location').textContent =
        node.fragment.meta_location || '';
    document.getElementById('fragment-source').textContent =
        '— ' + (node.fragment.meta_source || '');

    const total   = nodeDatabase.length;
    const done    = shownFragments.size;
    document.getElementById('fragment-counter').textContent =
        'FRAGMENT ' + done + ' / ' + total;

    // Rot warning pokud je grid pod tlakem
    const nodes   = Object.values(State.nodes);
    const avgRot  = nodes.reduce((s,n) => s + n.totalRot, 0) / nodes.length;
    const warning = document.getElementById('fragment-rot-warning');
    if (warning) warning.style.display = avgRot > 35 ? 'block' : 'none';

    // Log
    logEvent('FRAGMENT UNLOCKED · ' + node.node_id + ' · ' + node.node_title, 'active', 100);

    // Show modal
    modal.classList.add('open');

    // Reveal text s dramatickým zpožděním
    setTimeout(() => textEl.classList.add('revealed'), 300);
}

window.closeFragment = function() {
    const modal = document.getElementById('fragment-modal');
    if (modal) modal.classList.remove('open');
    engine.setTimeMode('live');
    updateTimeModeUI('live');
};

// ESC zavře fragment modal
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        const fModal = document.getElementById('fragment-modal');
        if (fModal && fModal.classList.contains('open')) {
            window.closeFragment();
            return;
        }
    }
});


// ── THROTTLE SLIDERS (HTML overlay) ──────────────────────────────────────────
// HTML input[range] nad SVG — žádný conflict s node drag
const throttleLayer  = document.getElementById('throttle-layer');
const throttleWraps  = {};  // { node_id: wrapEl }

function initThrottles() {
    nodeDatabase.forEach(node => {
        const wrap = document.createElement('div');
        wrap.className   = 'throttle-wrap';
        wrap.style.left  = '0px';
        wrap.style.top   = '0px';

        const input = document.createElement('input');
        input.type  = 'range';
        input.min   = '0';
        input.max   = '120';
        input.value = '50';
        input.step  = '1';

        const label = document.createElement('div');
        label.className   = 'throttle-pct';
        label.textContent = '50%';

        input.addEventListener('input', () => {
            const val = parseInt(input.value) / 100;
            engine.setThrottle(node.node_id, val);
            label.textContent = input.value + '%';
            wrap.className = 'throttle-wrap' +
                (val > 1.0 ? ' overclock' : val > 0 ? ' active' : '');
        });

        // Stop drag propagation
        input.addEventListener('mousedown', e => e.stopPropagation());
        input.addEventListener('touchstart', e => e.stopPropagation());

        wrap.appendChild(input);
        wrap.appendChild(label);
        throttleLayer.appendChild(wrap);
        throttleWraps[node.node_id] = { wrap, input, label };
    });
}

function updateThrottlePositions() {
    const boardRect = board.getBoundingClientRect();
    nodeDatabase.forEach(node => {
        const pos = layoutData[node.node_id];
        const tw  = throttleWraps[node.node_id];
        if (!pos || !tw) return;

        // Position: 36px right of node center
        tw.wrap.style.left = (pos.x + 36) + 'px';
        tw.wrap.style.top  = pos.y + 'px';

        // Update class based on current throttle
        const val = engine.getThrottle(node.node_id);
        tw.wrap.className = 'throttle-wrap' +
            (val > 1.0 ? ' overclock' : val > 0.1 ? ' active' : '');

        // Sync input value
        const pct = Math.round(val * 100);
        if (parseInt(tw.input.value) !== pct) {
            tw.input.value = pct;
            tw.label.textContent = pct + '%';
        }
    });
}

// ── INICIALIZACE ──────────────────────────────────────────────────────────────
function initRenderer() {
    nodeDatabase.forEach(nodeData => {
        const pos   = layoutData[nodeData.node_id] || { x: 50, y: 50 };
        const group = document.createElementNS(svgNS, "g");
        group.style.cursor = "pointer";

        // Rot aura
        const aura = document.createElementNS(svgNS, "circle");
        aura.setAttribute("r", 25);
        aura.setAttribute("fill", "rgba(255, 50, 50, 0)");
        group.appendChild(aura);

        // Extraction fill (roste při extrakci fragmentu)
        // extractFill přidán až PO hlavním kruhu — jinak je schovaný za ním
        const extractFill = document.createElementNS(svgNS, "circle");
        extractFill.setAttribute("r", 0);

        // Hlavní kruh uzlu
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("r", 20);
        circle.setAttribute("fill", "#1a1a1a");
        circle.setAttribute("stroke", "#d0d0d0");
        circle.setAttribute("stroke-width", "2");
        group.appendChild(circle);

        // Extraction fill — přidán PO kruhu, aby byl nad ním
        extractFill.setAttribute("fill",         "rgba(40, 80, 220, 0.15)");
        extractFill.setAttribute("stroke",       "#2266aa");
        extractFill.setAttribute("stroke-width", "0.8");
        group.appendChild(extractFill);

        // Node ID badge — permanentně viditelné
        const idBadge = makeText(-50, "9px", "#444", "middle");
        idBadge.textContent = nodeData.node_id;
        group.appendChild(idBadge);

        // Název + rot %
        const text = makeText(-35, "11px", "#d0d0d0", "middle");
        text.textContent = nodeData.node_title;
        group.appendChild(text);

        // Data profile
        const profileTag = makeText(32, "9px", "#444", "middle");
        profileTag.textContent = (nodeData.data_profile || []).join(" · ");
        group.appendChild(profileTag);

        // Status badge — DORMANT / PARSING / ACTIVE
        const statusBadge = makeText(46, "8px", "#555", "middle");
        statusBadge.textContent = "DORMANT";
        group.appendChild(statusBadge);

        // ── UNIFIED POINTER HANDLING ──────────────────────────────────────
        let pointerStartX = 0, pointerStartY = 0;
        let didLink = false;

        function onPointerDown(e, clientX, clientY, shiftKey) {
            didLink = false;
            pointerStartX = clientX;
            pointerStartY = clientY;
            if (shiftKey) {
                linkingNodeId = nodeData.node_id;
                tempLine.style.display = "block";
                hideOnboarding();
            } else {
                draggedNodeId = nodeData.node_id;
            }
            e.stopPropagation();
        }

        function onPointerUp(e, clientX, clientY, shiftKey) {
            // Handle link target
            if (linkingNodeId && linkingNodeId !== nodeData.node_id) {
                const connId  = engine.connectNodes(linkingNodeId, nodeData.node_id);
                const conn    = State.connections[connId];
                setActiveConn(connId);
                firstAction = false;
                hideOnboarding();
                didLink = true;

                if (conn.status === 'ACTIVE') {
                    logEvent(`${linkingNodeId} → ${nodeData.node_id} connected`, 'active');
                } else {
                    const req = conn.requiredLogic.join(' → ');
                    logEvent(`${linkingNodeId} → ${nodeData.node_id} · REQUIRED: ${req}`, 'connect');
                }
                linkingNodeId = null;
                tempLine.style.display = "none";
                e.stopPropagation();
                return;
            }

            // Handle click (no drag, no shift, no link)
            if (!didLink && !shiftKey) {
                const dx = Math.abs(clientX - pointerStartX);
                const dy = Math.abs(clientY - pointerStartY);
                if (dx < 8 && dy < 8) {
                    openNodeModal(nodeData.node_id);
                }
            }
        }

        // Mouse events
        group.addEventListener('mousedown', (e) => {
            onPointerDown(e, e.clientX, e.clientY, e.shiftKey);
        });
        group.addEventListener('mouseup', (e) => {
            onPointerUp(e, e.clientX, e.clientY, e.shiftKey);
        });

        // Touch events — long press (300ms) = link mode, short tap = click, drag = move
        let touchTimer = null;
        let touchIsLinking = false;
        let touchStartX = 0, touchStartY = 0;

        group.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            touchIsLinking = false;
            pointerStartX = t.clientX;
            pointerStartY = t.clientY;
            didLink = false;

            // Long press → enter link mode
            touchTimer = setTimeout(() => {
                touchIsLinking = true;
                linkingNodeId = nodeData.node_id;
                tempLine.style.display = "block";
                hideOnboarding();
                // Haptic feedback if available
                if (navigator.vibrate) navigator.vibrate(30);
            }, 300);

            e.stopPropagation();
            e.preventDefault();
        }, { passive: false });

        group.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            const dx = Math.abs(t.clientX - touchStartX);
            const dy = Math.abs(t.clientY - touchStartY);

            // Cancel long-press if finger moved
            if (dx > 10 || dy > 10) {
                if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
            }

            if (!touchIsLinking && !linkingNodeId) {
                // Regular drag
                draggedNodeId = nodeData.node_id;
                const rect = board.getBoundingClientRect();
                layoutData[nodeData.node_id].x = t.clientX - rect.left;
                layoutData[nodeData.node_id].y = t.clientY - rect.top;
            }

            if (touchIsLinking || linkingNodeId === nodeData.node_id) {
                const rect = board.getBoundingClientRect();
                const src = layoutData[nodeData.node_id];
                if (src) {
                    tempLine.setAttribute("x1", src.x);
                    tempLine.setAttribute("y1", src.y);
                    tempLine.setAttribute("x2", t.clientX - rect.left);
                    tempLine.setAttribute("y2", t.clientY - rect.top);
                }
            }

            e.preventDefault();
        }, { passive: false });

        group.addEventListener('touchend', (e) => {
            if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }

            const t = e.changedTouches[0];

            if (touchIsLinking || linkingNodeId === nodeData.node_id) {
                // Find target node under finger
                const rect = board.getBoundingClientRect();
                const px = t.clientX - rect.left;
                const py = t.clientY - rect.top;
                let targetId = null;
                for (const [nid, pos] of Object.entries(layoutData)) {
                    const dist = Math.hypot(px - pos.x, py - pos.y);
                    if (dist < 30 && nid !== nodeData.node_id) {
                        targetId = nid;
                        break;
                    }
                }
                if (targetId) {
                    const connId = engine.connectNodes(nodeData.node_id, targetId);
                    const conn   = State.connections[connId];
                    setActiveConn(connId);
                    firstAction = false;
                    hideOnboarding();
                    if (conn.status === 'ACTIVE') {
                        logEvent(`${nodeData.node_id} → ${targetId} connected`, 'active');
                    } else {
                        const req = conn.requiredLogic.join(' → ');
                        logEvent(`${nodeData.node_id} → ${targetId} · REQUIRED: ${req}`, 'connect');
                    }
                }
                linkingNodeId = null;
                tempLine.style.display = "none";
                touchIsLinking = false;
            } else {
                // Short tap = click
                const dx = Math.abs(t.clientX - touchStartX);
                const dy = Math.abs(t.clientY - touchStartY);
                if (dx < 10 && dy < 10) {
                    openNodeModal(nodeData.node_id);
                }
            }

            draggedNodeId = null;
            e.preventDefault();
        }, { passive: false });

        group.setAttribute("transform", `translate(${pos.x},${pos.y})`);
        nodeLayer.appendChild(group);

        visualNodes[nodeData.node_id] = {
            group, aura, extractFill, circle, idBadge, text, profileTag, statusBadge,
            title: nodeData.node_title,
            extractProgress: 0
        };
    });
}

// ── AKTIVNÍ SPOJENÍ ───────────────────────────────────────────────────────────
function setActiveConn(connId) {
    activeConnId = connId;
    const conn = State.connections[connId];
    if (!conn) return;
    const targetNode = nodeDatabase.find(n => n.node_id === conn.target);
    if (targetNode) updateParserTrayLabel(connId);
    // Reset opacity všech linek
    Object.values(visualLinks).forEach(l => {
        l.setAttribute("opacity", "0.4");
        l.setAttribute("stroke-width", "1");
    });
    // Show whisper for new connection
    const input = document.getElementById('parser-input');
    if (input && document.activeElement === input) {
        showWhisper(input.value);
    }
}

// ── PARSER TRAY LABEL ─────────────────────────────────────────────────────────
// Zobrazí sekvenci s checkmarky: ✓ COMMODIFY → [SYNTHESIZE]
function updateParserTrayLabel(connId) {
    const label = document.getElementById('parser-label');
    if (!label) return;
    const conn = State.connections[connId];
    if (!conn) { label.textContent = ''; return; }

    if (conn.status === 'ACTIVE') {
        label.textContent = 'CONNECTION ACTIVE';
        label.style.color = '#BA7517';
        return;
    }

    const parts = conn.requiredLogic.map((req, i) => {
        if (i < conn.appliedFilters.length) return '\u2713 ' + req;
        if (i === conn.appliedFilters.length) return '[' + req + ']';
        return req;
    });
    label.textContent = 'REQUIRED: ' + parts.join(' \u2192 ');
    label.style.color = '#BA7517';
}

// ── ONBOARDING HINT ───────────────────────────────────────────────────────────
function showOnboarding() {
    const hint = document.getElementById('onboarding-hint');
    if (hint) hint.style.display = 'block';
}

function hideOnboarding() {
    const hint = document.getElementById('onboarding-hint');
    if (hint) hint.style.display = 'none';
}

// ── POHYB MYŠI ────────────────────────────────────────────────────────────────
window.onmousemove = (e) => {
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (draggedNodeId) {
        layoutData[draggedNodeId].x = x;
        layoutData[draggedNodeId].y = y;
    }
    if (linkingNodeId) {
        const src = layoutData[linkingNodeId];
        if (src) {
            tempLine.setAttribute("x1", src.x); tempLine.setAttribute("y1", src.y);
            tempLine.setAttribute("x2", x);     tempLine.setAttribute("y2", y);
        }
    }
};

window.onmouseup = () => {
    draggedNodeId = null;
    if (linkingNodeId) { linkingNodeId = null; tempLine.style.display = "none"; }
};

// Global touch handlers for background
board.addEventListener('touchmove', (e) => {
    if (draggedNodeId || linkingNodeId) e.preventDefault();
}, { passive: false });

board.addEventListener('touchend', () => {
    draggedNodeId = null;
    if (linkingNodeId) { linkingNodeId = null; tempLine.style.display = "none"; }
});

// ── SPOJENÍ ───────────────────────────────────────────────────────────────────
function updateLinks() {
    for (const [id, conn] of Object.entries(State.connections)) {
        const s = layoutData[conn.source];
        const t = layoutData[conn.target];
        if (!s || !t) continue;

        if (!visualLinks[id]) {
            const line = document.createElementNS(svgNS, "line");
            line.style.cursor = 'pointer';
            line.addEventListener('click', () => {
                setActiveConn(id);
                updateParserTrayLabel(id);
            });
            linkLayer.appendChild(line);
            visualLinks[id] = line;
        }

        const line = visualLinks[id];
        line.setAttribute("x1", s.x); line.setAttribute("y1", s.y);
        line.setAttribute("x2", t.x); line.setAttribute("y2", t.y);

        const isSelected = id === activeConnId;

        if (conn.status === "ACTIVE") {
            const throttle  = engine.getThrottle(conn.target);
            const dashLen   = 16;
            const gapLen    = 10;
            const dashTotal = dashLen + gapLen;
            // Flow speed: higher throttle = faster. flowClock runs independently of pause.
            const speed     = 12 + throttle * 20;  // px/s
            const offset    = (flowClock * speed) % dashTotal;

            line.setAttribute("stroke",            isSelected ? "#ffaa33" : "#BA7517");
            line.setAttribute("stroke-width",      isSelected ? "3" : "2");
            line.setAttribute("opacity",           isSelected ? "1" : "0.8");
            line.setAttribute("stroke-dasharray",  `${dashLen} ${gapLen}`);
            line.setAttribute("stroke-dashoffset", String(dashTotal - offset));
        } else {
            line.setAttribute("stroke",           isSelected ? "#ffffff" : "#555");
            line.setAttribute("stroke-width",     isSelected ? "2" : "1");
            line.setAttribute("stroke-dasharray", "5,5");
            line.setAttribute("stroke-dashoffset", "0");
            line.setAttribute("opacity",          isSelected ? "1" : "0.5");
        }

        // Refresh parser label pokud je tato linka aktivní
        if (isSelected) updateParserTrayLabel(id);
    }
}

// ── NODE STATUS BADGE ─────────────────────────────────────────────────────────
function getNodeStatus(nodeId) {
    // Najdi všechna incoming spojení pro tento uzel
    const incoming = Object.values(State.connections).filter(c => c.target === nodeId);

    if (incoming.length === 0) {
        // Foundation node bez spojení — jen rot
        const node = nodeDatabase.find(n => n.node_id === nodeId);
        if (!node || !node.logic_requirements || node.logic_requirements.length === 0) {
            return { text: 'FOUNDATION', color: '#444' };
        }
        return { text: 'DORMANT', color: '#444' };
    }

    const active = incoming.filter(c => c.status === 'ACTIVE');
    const parsing = incoming.filter(c => c.status === 'DORMANT' && c.appliedFilters.length > 0);

    if (active.length === incoming.length) return { text: 'ACTIVE', color: '#BA7517' };
    if (parsing.length > 0) {
        const c = parsing[0];
        return { text: `PARSING ${c.appliedFilters.length}/${c.requiredLogic.length}`, color: '#a0f' };
    }
    return { text: 'DORMANT', color: '#555' };
}

// ── PARSER INPUT ──────────────────────────────────────────────────────────────
const parserInput = document.getElementById('parser-input');

parserInput.addEventListener('keypress', (e) => {
    if (e.key !== 'Enter') return;
    const val = parserInput.value.toUpperCase().trim();
    if (!val) return;

    if (activeConnId && State.connections[activeConnId]) {
        const conn = State.connections[activeConnId];
        if (conn.status === 'ACTIVE') {
            flash('#0a2233');
            logEvent(`[${val}] — connection already active`, 'system');
        } else {
            const prevApplied = conn.appliedFilters.length;
            engine.applyFilter(activeConnId, val);
            const updated = State.connections[activeConnId];
            if (updated.status === 'ACTIVE') {
                flash('#1a331a');
                logEvent(`[${val}] accepted · ${conn.source} → ${conn.target} ACTIVE`, 'active');
            } else if (updated.appliedFilters.length > prevApplied) {
                flash('#1a2233');
                const rem = updated.requiredLogic.slice(updated.appliedFilters.length).join(' → ');
                logEvent(`[${val}] ok · next: ${rem}`, 'connect');
            } else {
                flash('#331a1a');
                const expected = conn.requiredLogic[conn.appliedFilters.length] || '?';
                logEvent(`[${val}] rejected · expected [${expected}] · rot +5`, 'error');
            }
            updateParserTrayLabel(activeConnId);
        }
    } else {
        const label = document.getElementById('parser-label');
        if (label) {
            label.textContent = 'SELECT A CONNECTION FIRST';
            label.style.color = '#ff5555';
            setTimeout(() => {
                label.style.color = '#BA7517';
                label.textContent = '';
            }, 1500);
        }
        flash('#331a1a');
        logEvent('no connection selected', 'system');
    }
    parserInput.value = '';
});

function flash(color) {
    parserInput.style.backgroundColor = color;
    setTimeout(() => parserInput.style.backgroundColor = 'transparent', 300);
}

// ── ČASOVÉ MÓDY ──────────────────────────────────────────────────────────────
// ── TIME SYSTEM ───────────────────────────────────────────────────────────────
// ERA III: 1780–1830 = 50 years
// YEAR_SCALE: how many cycles = 1 historical year
// At 60fps, live 1.0x: ~60 cycles/s. Target ~5min gameplay = ~18000 cycles total.
// 50 years / 18000 cycles ≈ 0.00278 years/cycle → YEAR_SCALE = 360
const ERA_START_YEAR = 1780;
const ERA_END_YEAR   = 1830;
const YEAR_SCALE     = 360;  // cycles per historical year

function getHistoricalYear() {
    const year = ERA_START_YEAR + (State.currentCycle / YEAR_SCALE);
    return Math.min(ERA_END_YEAR + 5, year); // allow slight overshoot for collapse drama
}

// Pulse phase — increments in renderLoop for animation
let pulsePhase = 0;
let flowClock  = 0;   // Independent wall-clock for link flow — never pauses

function updateTimeModeUI(mode) {
    const map = {
        pause:  { border: "6px solid #0ff", lbl: "PAUSED" },
        parser: { border: "6px solid #333", lbl: "PARSER" },
        live:   { border: "none",           lbl: "" }
    };
    const cfg = map[mode] || map.live;
    uiLayer.style.borderLeft = cfg.border;
    const el = document.getElementById('time-mode-label');
    if (el) el.textContent = cfg.lbl;
}

function updateTimeDisplay(deltaSeconds) {
    // Advance pulse phase (independent of gridTimeMultiplier for pause visibility)
    const liveSpeed = State.gridTimeMultiplier > 0 ? State.gridTimeMultiplier : 0;
    pulsePhase += deltaSeconds * liveSpeed * 1.8;

    const year    = getHistoricalYear();
    const yearInt = Math.floor(year);
    const yearFrac = year - yearInt;

    // ── Historical year display
    const yearEl = document.getElementById('time-year');
    if (yearEl) yearEl.textContent = yearInt;

    // ── Multiplier label
    const modeEl = document.getElementById('time-multiplier');
    if (modeEl) {
        if (State.gridTimeMultiplier === 0) {
            modeEl.textContent = 'PAUSED';
            modeEl.style.color = '#0ff';
        } else if (State.gridTimeMultiplier <= 0.2) {
            modeEl.textContent = '0.2×';
            modeEl.style.color = '#666';
        } else {
            modeEl.textContent = '1.0×';
            modeEl.style.color = '#333';
        }
    }

    // ── Pulse bar
    const pulseEl = document.getElementById('time-pulse-fill');
    if (pulseEl) {
        if (State.gridTimeMultiplier === 0) {
            // Frozen — static dim bar
            pulseEl.style.width = '30%';
            pulseEl.style.opacity = '0.2';
            pulseEl.style.background = '#0ff';
        } else {
            // Sine wave pulse — speed tied to multiplier
            const freq   = 0.5 + State.gridTimeMultiplier * 1.5;
            const sine   = (Math.sin(pulsePhase * freq * Math.PI * 2) + 1) / 2;
            const width  = 15 + sine * 70;
            // Color shifts from amber toward red as avg rot rises
            const nodes  = Object.values(State.nodes);
            const avg    = nodes.length
                ? nodes.reduce((s,n) => s + n.totalRot, 0) / nodes.length
                : 0;
            const r = Math.round(180 + avg * 0.75);
            const g = Math.round(Math.max(0, 140 - avg * 1.4));
            pulseEl.style.width   = width + '%';
            pulseEl.style.opacity = '0.8';
            pulseEl.style.background = `rgb(${r},${g},30)`;
        }
    }

    // ── Year progress tick (thin line showing position in ERA III)
    const eraEl = document.getElementById('time-era-fill');
    if (eraEl) {
        const pct = Math.min(100, ((year - ERA_START_YEAR) / (ERA_END_YEAR - ERA_START_YEAR)) * 100);
        eraEl.style.width = pct + '%';
    }
}

parserInput.addEventListener('focus', () => {
    engine.setTimeMode('parser');
    updateTimeModeUI('parser');
    showWhisper(parserInput.value);
});

parserInput.addEventListener('blur', () => {
    engine.setTimeMode('live');
    updateTimeModeUI('live');
    setTimeout(hideWhisper, 150);
});

parserInput.addEventListener('input', () => {
    showWhisper(parserInput.value);
});

window.addEventListener('keydown', (e) => {
    // Whisper navigation
    if (document.activeElement === parserInput) {
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            if (whisperItems.length === 0) showWhisper(parserInput.value);
            navigateWhisper(1);
            return;
        }
        if (e.code === 'ArrowUp') {
            e.preventDefault();
            navigateWhisper(-1);
            return;
        }
        if (e.code === 'Tab') {
            e.preventDefault();
            if (whisperSelected >= 0 && whisperItems[whisperSelected]) {
                selectWhisperItem(whisperItems[whisperSelected].filter);
            } else if (whisperItems.length > 0) {
                selectWhisperItem(whisperItems[0].filter);
            }
            return;
        }
        if (e.code === 'Escape') {
            hideWhisper();
            return;
        }
    }

    if (e.code === 'Space' && document.activeElement !== parserInput) {
        e.preventDefault();
        if (State.isHalted) return;
        const next = State.gridTimeMultiplier === 0 ? 'live' : 'pause';
        engine.setTimeMode(next);
        updateTimeModeUI(next);
    }
});

// ── AUDIT REPORT MODAL ────────────────────────────────────────────────────────
function showAuditReport(report) {
    if (document.getElementById('audit-modal')) return;
    const rows = report.nodeSnapshot.map(n =>
        `<tr><td style="color:#888;padding:2px 8px;">${n.id}</td>
         <td style="padding:2px 8px;">${n.title}</td>
         <td style="color:${parseFloat(n.totalRot)>50?'#ff5555':'#888'};padding:2px 8px;text-align:right;">${n.totalRot}%</td></tr>`
    ).join('');
    const modal = document.createElement('div');
    modal.id = 'audit-modal';
    modal.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        background:#0a0a0a;border:1px solid #A32D2D;padding:30px;min-width:500px;
        max-height:80vh;overflow-y:auto;z-index:1000;font-family:monospace;`;
    modal.innerHTML = `
        <div style="color:#A32D2D;font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:16px;">&#x29BF; THE AUDIT REPORT</div>
        <div style="color:#888;font-size:11px;margin-bottom:20px;border-bottom:1px solid #222;padding-bottom:12px;">
            COLLAPSE AT CYCLE ${report.collapseCycle} &nbsp;&middot;&nbsp; AVG ROT: ${report.avgRot}% &nbsp;&middot;&nbsp; DEAD NODES: ${report.deadNodes}/${report.totalNodes}
        </div>
        <div style="color:#BA7517;font-size:11px;margin-bottom:8px;">POINT OF FAILURE: ${report.worstNodeTitle} (${report.worstNodeRot}%)</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px;">
            <thead><tr style="color:#555;border-bottom:1px solid #222;">
                <th style="text-align:left;padding:4px 8px;">ID</th>
                <th style="text-align:left;padding:4px 8px;">NODE</th>
                <th style="text-align:right;padding:4px 8px;">TOTAL ROT</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:20px;color:#444;font-size:10px;text-align:center;">[PRESS R TO RESET]</div>`;
    document.body.appendChild(modal);
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && State.isHalted) {
        const m = document.getElementById('audit-modal');
        if (m) m.remove();
        engine.reset();
        // Clear log entries
        clearLog();
        firstAction = true;
        logEvent('GRID RESET · new audit session', 'system');
        setTimeout(showOnboarding, 500);
    }
});

// ── RENDER LOOP ───────────────────────────────────────────────────────────────
let lastTime = 0;

function renderLoop(timestamp) {
    const deltaSeconds = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (!State.isHalted) engine.tick(deltaSeconds);
    flowClock += deltaSeconds;  // always advances — flow never freezes

    updateLinks();
    updateThrottlePositions();
    updateTimeDisplay(deltaSeconds);

    for (const [id, nodeState] of Object.entries(State.nodes)) {
        const pos = layoutData[id];
        const v   = visualNodes[id];
        if (!pos || !v) continue;

        v.group.setAttribute("transform", `translate(${pos.x},${pos.y})`);

        // Rot aura
        const rot = nodeState.totalRot / 100;
        v.aura.setAttribute("r",    20 + (rot * 40));
        v.aura.setAttribute("fill", `rgba(255, 50, 50, ${rot * 0.6})`);

        // Barva kruhu podle rot
        if (nodeState.totalRot >= 100) {
            v.circle.setAttribute("stroke", "#ff0000");
            v.circle.setAttribute("stroke-width", "3");
            v.circle.setAttribute("fill", "#2a0000");
        } else if (nodeState.totalRot > 50) {
            v.circle.setAttribute("stroke", "#A32D2D");
            v.circle.setAttribute("stroke-width", "2");
        } else {
            v.circle.setAttribute("stroke", "#d0d0d0");
            v.circle.setAttribute("stroke-width", "2");
            v.circle.setAttribute("fill", "#1a1a1a");
        }

        // Název + %
        v.text.textContent = `${v.title} (${nodeState.totalRot.toFixed(1)}%)`;
        v.text.setAttribute("fill", nodeState.totalRot > 50 ? "#ff5555" : "#d0d0d0");

        // Status badge
        const status = getNodeStatus(id);
        v.statusBadge.textContent = status.text;
        v.statusBadge.setAttribute("fill", status.color);

        // Rot tracking — každých 5% + throttle 10s + threshold alerts
        const rotPct  = nodeState.totalRot;
        const nd      = nodeDatabase.find(n => n.node_id === id);
        const ntitle  = nd ? nd.node_title : id;
        const prevRot = rotPrevious[id] || 0;
        const delta   = rotPct - prevRot;
        const nowMs   = Date.now();
        const lastTs  = rotWarned[id + '_ts'] || 0;

        if (delta >= ROT_DELTA_LOG && nowMs - lastTs > 10000) {
            rotPrevious[id]      = rotPct;
            rotWarned[id + '_ts'] = nowMs;

            let evType = 'rot';
            let suffix = '';
            if      (rotPct >= 90) { evType = 'critical'; suffix = ' — COLLAPSE IMMINENT'; }
            else if (rotPct >= 75) { evType = 'error';    suffix = ' — CRITICAL'; }
            else if (rotPct >= 50) { evType = 'warning';  suffix = ' — WARNING'; }
            else if (rotPct >= 25) { evType = 'rot';      suffix = ' — DEGRADING'; }

            logEvent(`${id} · ${ntitle} · ${rotPct.toFixed(0)}%${suffix}`, evType, rotPct);
        }

        // Hard threshold alerts — jednou per run
        if (rotPct >= 90 && !rotWarned[id + '_90']) {
            rotWarned[id + '_90'] = true;
            logEvent(`${id} · ${ntitle} — TERMINAL ROT`, 'critical', rotPct);
            if (typeof Audio !== 'undefined') Audio.clang();
        } else if (rotPct >= 75 && !rotWarned[id + '_75']) {
            rotWarned[id + '_75'] = true;
            logEvent(`${id} · ${ntitle} · ${rotPct.toFixed(0)}% — CRITICAL`, 'error', rotPct);
            if (typeof Audio !== 'undefined') Audio.clang();
        } else if (rotPct >= 50 && !rotWarned[id + '_50']) {
            rotWarned[id + '_50'] = true;
            logEvent(`${id} · ${ntitle} · ${rotPct.toFixed(0)}% — WARNING`, 'warning', rotPct);
        }

        // Extraction fill — roste podle engine extraction progress
        const ext = State.extraction[id];
        if (ext) {
            const progress = ext.progress || 0;
            // Minimální radius 3px aby byl vždy viditelný od začátku
            const fillR = progress > 0 ? Math.max(3, progress * 18) : 0;
            v.extractFill.setAttribute("r", String(fillR));

            // Barva: tmavě modrá → jasná bílá jak se blíží k dokončení
            if (progress > 0) {
                const alpha = Math.max(0.2, 0.2 + progress * 0.7);
                const white = Math.round(progress * 200);
                const r = 40 + white;
                const g = 80 + white;
                const b = 220;
                v.extractFill.setAttribute("fill",   `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`);
                v.extractFill.setAttribute("stroke", progress > 0.7 ? "#aaddff" : "#2266aa");
                v.extractFill.setAttribute("stroke-width", progress > 0.7 ? "1.5" : "0.8");
            } else {
                v.extractFill.setAttribute("r", "0");
            }

            // Fragment completed — zobraz modal (jednou)
            if (ext.completed && !shownFragments.has(id)) {
                if (typeof Audio !== 'undefined') Audio.chime();
                showFragment(id);
            }
        }
    }

    updateStatusBar();

    if (State.isHalted && State.auditReport) {
        logEvent(`SYS_LOCK · CASCADE FAILURE · cycle ${Math.round(State.currentCycle)}`, 'critical', 100);
        if (typeof Audio !== 'undefined') Audio.steamWhistle();
        showAuditReport(State.auditReport);
        return;
    }

    requestAnimationFrame(renderLoop);
}

// ── STATUS BAR ────────────────────────────────────────────────────────────────
function updateStatusBar() {
    const bar = document.getElementById('status-bar');
    if (!bar) return;
    const nodes = Object.values(State.nodes);
    if (!nodes.length) return;
    const avg    = (nodes.reduce((s,n) => s + n.totalRot, 0) / nodes.length).toFixed(1);
    const dead   = nodes.filter(n => n.totalRot >= 100).length;
    const active = Object.values(State.connections).filter(c => c.status === 'ACTIVE').length;
    const total  = Object.keys(State.connections).length;
    const extracted = Object.values(State.extraction).filter(e => e.completed).length;
    const year   = Math.floor(getHistoricalYear());
    bar.textContent = `${year} · AVG ROT ${avg}% · CONNECTIONS ${active}/${total} · FRAGMENTS ${extracted}/15 · DEAD ${dead}`;
    bar.style.color  = parseFloat(avg) > 50 ? '#cc3333' : parseFloat(avg) > 30 ? '#c87820' : '#444';
}

initRenderer();
initThrottles();
showOnboarding();
logEvent('SYSTEMIC SYNTHESIS · audit engine online', 'system');
logEvent('15 nodes loaded · Lancashire 1780-1830', 'system');
logEvent('start: SHIFT+DRAG N04 to N07', 'info');
requestAnimationFrame(renderLoop);
