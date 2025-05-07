const DATA_URL = 'bobert_openalex_enhanced.json';

let allRecords = [], filteredRecords = [], recordMap = {};
let currentPage = 1, pageSize = 10, currentSeed = null;
let currentGraphNodes = [];

; (async function () {
    allRecords = await loadData();
    allRecords.forEach(r => recordMap[r.id] = r);

    buildThemeFilters(allRecords);
    buildStateFilters(allRecords);

    filteredRecords = allRecords.slice();
    renderTable(); renderPagination();
    setupSearch(); setupCSVButtons();

    // Graph open
    document.querySelector('#results').addEventListener('click', e => {
        if (e.target.classList.contains('network-btn')) {
            const tr = e.target.closest('tr'),
                idx = (currentPage - 1) * pageSize
                    + Array.from(tr.parentNode.children).indexOf(tr);
            currentSeed = filteredRecords[idx];
            showGraph(currentSeed);
            document.getElementById('graphPanel').classList.remove('d-none');
        }
    });

    // Close graph / regenerate
    document.getElementById('close-graph').onclick = () =>
        document.getElementById('graphPanel').classList.add('d-none');
    document.getElementById('graph-regenerate').onclick = () =>
        currentSeed && showGraph(currentSeed);

})();

async function loadData() {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw Error(r.statusText);
    return (await r.json()).records || [];
}

// Themes: field → domain → topics
function buildThemeFilters(records) {
    const container = document.getElementById('theme-filters');
    const badge = document.getElementById('theme-count');
    // map[field][domain] = Set of topic names
    const map = {};
    records.forEach(r => {
        (r.topics || []).forEach(t => {
            const f = t.field || 'Unknown', d = t.domain || 'Unknown';
            map[f] = map[f] || {};
            map[f][d] = map[f][d] || new Set();
            map[f][d].add(t.name);
        });
    });
    // total count
    let total = 0;
    Object.values(map).forEach(dom => Object.values(dom).forEach(s => total += s.size));
    badge.textContent = total;

    Object.keys(map).sort().forEach((fieldName, i) => {
        const fieldId = `field-${i}`;
        // Field header + collapse
        const fldDiv = document.createElement('div');
        fldDiv.className = 'mb-3';
        fldDiv.innerHTML = `
      <button class="btn btn-sm btn-outline-primary" 
              data-bs-toggle="collapse" data-bs-target="#${fieldId}">
        ${fieldName}
      </button>
      <div id="${fieldId}" class="collapse ms-3 mt-2"></div>`;
        container.appendChild(fldDiv);

        const fldCol = fldDiv.querySelector(`#${fieldId}`);
        Object.keys(map[fieldName]).sort().forEach((domainName, j) => {
            const domId = `dom-${i}-${j}`;
            const domDiv = document.createElement('div');
            domDiv.className = 'mb-2';
            domDiv.innerHTML = `
        <button class="btn btn-sm btn-outline-secondary"
                data-bs-toggle="collapse" data-bs-target="#${domId}">
          ${domainName}
        </button>
        <div id="${domId}" class="collapse ms-3 mt-1"></div>`;
            fldCol.appendChild(domDiv);

            const domCol = domDiv.querySelector(`#${domId}`);
            Array.from(map[fieldName][domainName]).sort().forEach(topic => {
                const chkId = `${domId}-${topic}`.replace(/\\W+/g, '_');
                const check = document.createElement('div');
                check.className = 'form-check form-check-inline';
                check.innerHTML = `
          <input class="form-check-input" type="checkbox" id="${chkId}" value="${topic}">
          <label class="form-check-label" for="${chkId}">${topic}</label>`;
                domCol.appendChild(check);
            });
        });
    });
}

function buildStateFilters(records) {
    const c = document.getElementById('state-filters'),
        badge = document.getElementById('state-count'),
        set = new Set();
    records.forEach(r => (r.states || []).forEach(s => set.add(s)));
    const arr = Array.from(set).sort();
    badge.textContent = arr.length;
    arr.forEach(s => {
        const id = `state-${s}`.replace(/\\W+/g, '_');
        const d = document.createElement('div');
        d.className = 'form-check form-check-inline';
        d.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${s}">
      <label class="form-check-label" for="${id}">${s}</label>`;
        c.appendChild(d);
    });
}

function getCheckedValues(cid) {
    return Array.from(
        document.querySelectorAll(`#${cid} input:checked`)
    ).map(i => i.value.toLowerCase());
}

function applyFilters() {
    const titleQ = (document.getElementById('search').value || '').trim().toLowerCase(),
        start = document.getElementById('start-date').value,
        end = document.getElementById('end-date').value,
        themes = getCheckedValues('theme-filters'),
        states = getCheckedValues('state-filters'),
        authorQ = (document.getElementById('author-filter').value || '').toLowerCase(),
        journalQ = (document.getElementById('journal-filter').value || '').toLowerCase(),
        keywordQ = (document.getElementById('keyword-filter').value || '').toLowerCase(),
        minC = parseInt(document.getElementById('min-cites').value) || 0,
        maxC = parseInt(document.getElementById('max-cites').value) || Infinity;

    filteredRecords = allRecords.filter(r => {
        if (titleQ && !r.title.toLowerCase().includes(titleQ)) return false;
        if (start && r.publication_date < start) return false;
        if (end && r.publication_date > end) return false;
        if (themes.length) {
            const t = (r.topics || []).map(x => x.name.toLowerCase());
            if (!themes.some(v => t.includes(v))) return false;
        }
        if (states.length) {
            const s = (r.states || []).map(x => x.toLowerCase());
            if (!states.some(v => s.includes(v))) return false;
        }
        if (authorQ) {
            const a = r.authors.map(x => x.name).join(' ').toLowerCase();
            if (!a.includes(authorQ)) return false;
        }
        if (journalQ && !r.journal.toLowerCase().includes(journalQ)) return false;
        if (keywordQ) {
            const k = (r.keywords || []).join(' ').toLowerCase();
            if (!k.includes(keywordQ)) return false;
        }
        const c = r.citation_counts.forward || 0;
        if (c < minC || c > maxC) return false;
        return true;
    });

    currentPage = 1;
    renderTable(); renderPagination();
}

function renderTable() {
    const tbody = document.querySelector('#results tbody');
    tbody.innerHTML = '';
    const start = (currentPage - 1) * pageSize;
    const rows = filteredRecords.slice(start, start + pageSize);
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3">
      No records match filters.
    </td></tr>`;
        return;
    }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td><a href="${r.url || '#'}" target="_blank">${r.title}</a></td>
      <td>${r.publication_year || ''}</td>
      <td>${r.authors.map(x => x.name).join(', ')}</td>
      <td>${r.citation_counts.forward || 0}</td>
      <td>${r.is_oa ? 'Yes' : 'No'}</td>
      <td>${r.type || ''}</td>
      <td><button class="btn btn-sm btn-outline-secondary details-btn">Details</button></td>
      <td><button class="btn btn-sm btn-outline-secondary network-btn">Graph</button></td>`;
        tbody.appendChild(tr);
        tr.querySelector('.details-btn').onclick = () => showDetails(r);
    });
}

function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    const ul = document.getElementById('pagination');
    ul.innerHTML = '';
    const make = (lbl, dis, fn) => {
        const li = document.createElement('li');
        li.className = `page-item${dis ? ' disabled' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'page-link'; btn.textContent = lbl;
        if (!dis) btn.onclick = fn;
        li.appendChild(btn);
        return li;
    };
    ul.appendChild(make('Prev', currentPage === 1, () => {
        currentPage--; renderTable(); renderPagination();
    }));
    for (let p = 1; p <= totalPages; p++) {
        const li = document.createElement('li');
        li.className = `page-item${p === currentPage ? ' active' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'page-link'; btn.textContent = p;
        btn.onclick = () => {
            currentPage = p; renderTable(); renderPagination();
        };
        li.appendChild(btn);
        ul.appendChild(li);
    }
    ul.appendChild(make('Next', currentPage === totalPages, () => {
        currentPage++; renderTable(); renderPagination();
    }));
}

function setupSearch() { document.getElementById('search-btn').onclick = applyFilters; }
function setupCSVButtons() {
    document.getElementById('download-csv').onclick = () => generateCSV(filteredRecords, 'crp_search.csv');
    document.getElementById('download-graph-csv').onclick = () => generateCSV(currentGraphNodes, 'crp_graph.csv');
}

function generateCSV(recs, filename) {
    const cols = ['url', 'is_oa', 'title', 'doi', 'type', 'journal', 'publication_year', 'keywords', 'authors'];
    const header = cols.join(',') + '\n';
    const lines = recs.map(r => {
        const map = {
            url: r.url || '', is_oa: r.is_oa ? 'Yes' : 'No',
            title: `"${r.title.replace(/"/g, '""')}"`,
            doi: r.doi || '', type: r.type || '',
            journal: `"${(r.journal || '').replace(/"/g, '""')}"`,
            publication_year: r.publication_year || '',
            keywords: `"${(r.keywords || []).join('|').replace(/"/g, '""')}"`,
            authors: `"${r.authors.map(x => x.name).join('|').replace(/"/g, '""')}"`
        };
        return cols.map(c => map[c]).join(',');
    });
    const csv = header + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function showDetails(r) {
    const mb = document.getElementById('modal-body');
    mb.innerHTML = `
    <h5>${r.title}</h5>
    <p><strong>ID:</strong> ${r.id.split('/').pop()}</p>
    <p><strong>Publication Date:</strong> ${r.publication_date || 'N/A'}</p>
    <p><strong>Topics:</strong> ${(r.topics || []).map(t => t.name).join(', ')}</p>
    <p><strong>Keywords:</strong> ${(r.keywords || []).join(', ')}</p>
    <p><strong>States:</strong> ${(r.states || []).join(', ')}</p>
    <p><strong>URL:</strong> <a href="${r.url || '#'}">${r.url || 'N/A'}</a></p>`;
    new bootstrap.Modal(document.getElementById('detailModal')).show();
}

function showGraph(seed) {
    const depth = parseInt(document.getElementById('graph-depth').value, 10) || 1;
    const nodes = [], edges = []; const seenN = new Set(), seenE = new Set();
    currentGraphNodes = [];

    function addNode(id, label, type, meta) {
        if (seenN.has(id)) return; seenN.add(id);
        nodes.push({ data: { id, label, metaType: type } });
        currentGraphNodes.push(meta);
    }
    function addEdge(s, t) {
        const eid = `${s}->${t}`; if (seenE.has(eid)) return; seenE.add(eid);
        edges.push({ data: { id: eid, source: s, target: t } });
    }

    function recurse(id, lvl) {
        if (lvl >= depth) return;
        const m = recordMap[id];
        (m.backward_citations || []).forEach(rid => {
            if (recordMap[rid]) {
                addNode(rid, recordMap[rid].title, 'backward', recordMap[rid]);
                addEdge(id, rid);
                recurse(rid, lvl + 1);
            }
        });
        (m.forward_citations || []).forEach(cid => {
            if (recordMap[cid]) {
                addNode(cid, recordMap[cid].title, 'forward', recordMap[cid]);
                addEdge(cid, id);
                recurse(cid, lvl + 1);
            }
        });
    }

    addNode(seed.id, seed.title, 'seed', seed);
    recurse(seed.id, 0);

    const els = nodes.concat(edges);
    const cont = document.getElementById('cy'); cont.innerHTML = '';

    const cy = cytoscape({
        container: cont,
        elements: els,
        style: [
            { selector: 'node', style: { width: 90, height: 90, label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 150, 'font-size': 8, 'text-valign': 'center', color: '#000' } },
            { selector: 'node[metaType="seed"]', style: { 'background-color': '#0d6efd' } },
            { selector: 'node[metaType="backward"]', style: { 'background-color': 'green' } },
            { selector: 'node[metaType="forward"]', style: { 'background-color': 'yellow' } },
            { selector: 'edge', style: { width: 2, 'line-color': '#999' } }
        ]
    });
    cy.layout({ name: 'cose', idealEdgeLength: 120, nodeOverlap: 40, nodeRepulsion: 8000, gravity: 0.1, numIter: 500, tile: true }).run();
    cy.on('tap', 'node', evt => document.getElementById('node-info').textContent = evt.target.data('label'));
}
