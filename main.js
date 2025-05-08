const DATA_URL = 'bobert_openalex_enhanced.json';

let allRecords = [];
let filteredRecords = [];
let recordMap = {};
let currentPage = 1;
const pageSize = 10;
let currentSeed = null;
let currentGraphNodes = [];

; (async function init() {
    // 1) Load data
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(resp.statusText);
    const json = await resp.json();
    allRecords = json.records || [];
    // 2) Build lookup map
    allRecords.forEach(r => recordMap[r.id] = r);

    // 3) Build our three collapsible filters
    buildFieldFilters(allRecords);
    buildDomainFilters(allRecords);
    buildStateFilters(allRecords);

    // 4) Initial render
    filteredRecords = allRecords.slice();
    renderTable();
    renderPagination();

    // 5) Wire up controls
    document.getElementById('search-btn').onclick = onSearch;
    document.getElementById('clear-btn').onclick = onClear;
    document.getElementById('download-csv').onclick = () => downloadCSV(filteredRecords, 'crp_search.csv');
    document.getElementById('download-graph-csv').onclick = () => downloadCSV(currentGraphNodes, 'crp_graph.csv');

    document.getElementById('results').addEventListener('click', onTableClick);
    document.getElementById('close-graph').onclick = () => document.getElementById('graphPanel').classList.add('d-none');
    document.getElementById('graph-regenerate').onclick = () => currentSeed && showGraph(currentSeed);

    // allow Enter in search box
    document.getElementById('search').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSearch();
        }
    });
})();

function buildFieldFilters(records) {
    const container = document.getElementById('field-filters');
    const badge = document.getElementById('field-count');
    const set = new Set();
    records.forEach(r => {
        const f = r.primary_topic.field;
        if (f) set.add(f);
    });
    const list = Array.from(set).sort();
    badge.textContent = list.length;
    list.forEach(name => {
        const id = `field-${name.replace(/\W+/g, '_')}`;
        const div = document.createElement('div');
        div.className = 'form-check form-check-inline';
        div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${name}">
      <label class="form-check-label" for="${id}">${name}</label>
    `;
        container.appendChild(div);
    });
}

function buildDomainFilters(records) {
    const container = document.getElementById('domain-filters');
    const badge = document.getElementById('domain-count');
    const set = new Set();
    records.forEach(r => {
        const d = r.primary_topic.domain;
        if (d) set.add(d);
    });
    const list = Array.from(set).sort();
    badge.textContent = list.length;
    list.forEach(name => {
        const id = `domain-${name.replace(/\W+/g, '_')}`;
        const div = document.createElement('div');
        div.className = 'form-check form-check-inline';
        div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${name}">
      <label class="form-check-label" for="${id}">${name}</label>
    `;
        container.appendChild(div);
    });
}

function buildStateFilters(records) {
    const container = document.getElementById('state-filters');
    const badge = document.getElementById('state-count');
    const set = new Set();
    records.forEach(r => (r.states || []).forEach(s => set.add(s)));
    const list = Array.from(set).sort();
    badge.textContent = list.length;
    list.forEach(name => {
        const id = `state-${name.replace(/\W+/g, '_')}`;
        const div = document.createElement('div');
        div.className = 'form-check form-check-inline';
        div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${name}">
      <label class="form-check-label" for="${id}">${name}</label>
    `;
        container.appendChild(div);
    });
}

function getCheckedValues(containerId) {
    return Array.from(
        document.querySelectorAll(`#${containerId} input:checked`)
    ).map(i => i.value.toLowerCase());
}

function onSearch() {
    applyFilters();
    currentPage = 1;
    renderTable();
    renderPagination();
}

function onClear() {
    // reset all form controls
    document.getElementById('filters').reset();
    // uncheck all custom checkboxes
    ['field-filters', 'domain-filters', 'state-filters'].forEach(cid => {
        document.querySelectorAll(`#${cid} input:checked`).forEach(i => i.checked = false);
    });
    document.getElementById('search').value = '';
    // restore full list
    filteredRecords = allRecords.slice();
    currentPage = 1;
    renderTable();
    renderPagination();
}

function applyFilters() {
    const titleQ = (document.getElementById('search').value || '').trim().toLowerCase();
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    const fields = getCheckedValues('field-filters');
    const domains = getCheckedValues('domain-filters');
    const states = getCheckedValues('state-filters');
    const authorQ = (document.getElementById('author-filter').value || '').toLowerCase();
    const journalQ = (document.getElementById('journal-filter').value || '').toLowerCase();
    const keywordQ = (document.getElementById('keyword-filter').value || '').toLowerCase();
    const minC = parseInt(document.getElementById('min-cites').value) || 0;
    const maxC = parseInt(document.getElementById('max-cites').value) || Infinity;

    filteredRecords = allRecords.filter(r => {
        if (titleQ && !r.title.toLowerCase().includes(titleQ)) return false;
        if (start && r.publication_date < start) return false;
        if (end && r.publication_date > end) return false;

        if (fields.length) {
            const f = (r.primary_topic.field || '').toLowerCase();
            if (!fields.includes(f)) return false;
        }
        if (domains.length) {
            const d = (r.primary_topic.domain || '').toLowerCase();
            if (!domains.includes(d)) return false;
        }
        if (states.length) {
            const sList = (r.states || []).map(s => s.toLowerCase());
            if (!states.some(s => sList.includes(s))) return false;
        }
        if (authorQ) {
            const aList = r.authors.map(a => a.name).join(' ').toLowerCase();
            if (!aList.includes(authorQ)) return false;
        }
        if (journalQ && !r.journal.toLowerCase().includes(journalQ)) return false;
        if (keywordQ) {
            const kList = (r.keywords || []).join(' ').toLowerCase();
            if (!kList.includes(keywordQ)) return false;
        }
        const c = r.citation_counts.forward || 0;
        if (c < minC || c > maxC) return false;

        return true;
    });
}

function renderTable() {
    const tbody = document.querySelector('#results tbody');
    tbody.innerHTML = '';
    const startIdx = (currentPage - 1) * pageSize;
    const pageRecs = filteredRecords.slice(startIdx, startIdx + pageSize);
    if (!pageRecs.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3">No records match filters.</td></tr>`;
        return;
    }
    pageRecs.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td><a href="${r.url || '#'}" target="_blank">${r.title}</a></td>
      <td>${r.publication_year || ''}</td>
      <td>${r.authors.map(a => a.name).join(', ')}</td>
      <td>${r.citation_counts.forward || 0}</td>
      <td>${r.is_oa ? 'Yes' : 'No'}</td>
      <td>${r.type || ''}</td>
      <td><button class="btn btn-sm btn-outline-secondary details-btn">Details</button></td>
      <td><button class="btn btn-sm btn-outline-secondary network-btn">Graph</button></td>
    `;
        tbody.appendChild(tr);
    });
}

function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    const ul = document.getElementById('pagination');
    ul.innerHTML = '';

    const makeItem = (label, disabled, clickHandler, active = false) => {
        const li = document.createElement('li');
        li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'page-link';
        btn.textContent = label;
        if (!disabled) btn.onclick = clickHandler;
        li.appendChild(btn);
        return li;
    };

    ul.appendChild(makeItem('Prev', currentPage === 1, () => { currentPage--; updateView(); }));

    // show up to 5 page numbers around current
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    if (currentPage <= 3) end = Math.min(5, totalPages);
    if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);

    for (let p = start; p <= end; p++) {
        ul.appendChild(makeItem(p, false, () => { currentPage = p; updateView(); }, p === currentPage));
    }

    ul.appendChild(makeItem('Next', currentPage === totalPages, () => { currentPage++; updateView(); }));
}

function updateView() {
    renderTable();
    renderPagination();
}

function onTableClick(e) {
    if (e.target.classList.contains('details-btn')) {
        const idx = (currentPage - 1) * pageSize + Array.from(e.target.closest('tbody').children).indexOf(e.target.closest('tr'));
        showDetails(filteredRecords[idx]);
    }
    if (e.target.classList.contains('network-btn')) {
        const idx = (currentPage - 1) * pageSize + Array.from(e.target.closest('tbody').children).indexOf(e.target.closest('tr'));
        currentSeed = filteredRecords[idx];
        showGraph(currentSeed);
        document.getElementById('graphPanel').classList.remove('d-none');
    }
}

function downloadCSV(records, filename) {
    const cols = ['url', 'is_oa', 'title', 'doi', 'type', 'journal', 'publication_year', 'keywords', 'authors'];
    const header = cols.join(',') + '\n';
    const lines = records.map(r => {
        const map = {
            url: r.url || '',
            is_oa: r.is_oa ? 'Yes' : 'No',
            title: `"${r.title.replace(/"/g, '""')}"`,
            doi: r.doi || '',
            type: r.type || '',
            journal: `"${(r.journal || '').replace(/"/g, '""')}"`,
            publication_year: r.publication_year || '',
            keywords: `"${(r.keywords || []).join('|').replace(/"/g, '""')}"`,
            authors: `"${r.authors.map(a => a.name).join('|').replace(/"/g, '""')}"`
        };
        return cols.map(c => map[c]).join(',');
    });
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' });
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
    <p><strong>URL:</strong> <a href="${r.url || '#'}">${r.url || 'N/A'}</a></p>
  `;
    new bootstrap.Modal(document.getElementById('detailModal')).show();
}

function showGraph(seed) {
    const depth = parseInt(document.getElementById('graph-depth').value, 10) || 1;
    const nodes = [], edges = [];
    const seenN = new Set(), seenE = new Set();
    currentGraphNodes = [];

    function addNode(id, label, type, meta) {
        if (seenN.has(id)) return;
        seenN.add(id);
        nodes.push({ data: { id, label, metaType: type } });
        currentGraphNodes.push(meta);
    }
    function addEdge(src, tgt) {
        const eid = `${src}->${tgt}`;
        if (seenE.has(eid)) return;
        seenE.add(eid);
        edges.push({ data: { id: eid, source: src, target: tgt } });
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

    const cy = cytoscape({
        container: document.getElementById('cy'),
        elements: nodes.concat(edges),
        style: [
            {
                selector: 'node', style: {
                    width: 90, height: 90, label: 'data(label)',
                    'text-wrap': 'wrap', 'text-max-width': 150,
                    'font-size': 8, 'text-valign': 'center', color: '#000'
                }
            },
            { selector: 'node[metaType="seed"]', style: { 'background-color': '#0d6efd' } },
            { selector: 'node[metaType="backward"]', style: { 'background-color': 'green' } },
            { selector: 'node[metaType="forward"]', style: { 'background-color': 'yellow' } },
            { selector: 'edge', style: { width: 2, 'line-color': '#999' } },
        ],
        layout: {
            name: 'cose', idealEdgeLength: 120, nodeOverlap: 40,
            nodeRepulsion: 8000, gravity: 0.1, numIter: 500, tile: true
        }
    });

    cy.on('tap', 'node', evt => {
        document.getElementById('node-info').textContent = evt.target.data('label');
    });
}
