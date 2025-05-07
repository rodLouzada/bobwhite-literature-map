const DATA_URL = 'bobert_openalex_enhanced.json';

let allRecords = [];
let filteredRecords = [];
let recordMap = {};
let currentPage = 1;
const pageSize = 10;
let currentSeed = null;
let currentGraphNodes = [];  // for graph CSV

; (async function () {
    allRecords = await loadData();
    allRecords.forEach(r => recordMap[r.id] = r);

    buildThemeFilters(allRecords);
    buildStateFilters(allRecords);

    filteredRecords = allRecords.slice();
    renderTable(); renderPagination();
    setupSearch();
    setupCSVButtons();

    // Graph open
    document.querySelector('#results').addEventListener('click', e => {
        if (e.target.classList.contains('network-btn')) {
            const tr = e.target.closest('tr');
            const idx = ((currentPage - 1) * pageSize) +
                Array.from(tr.parentNode.children).indexOf(tr);
            currentSeed = filteredRecords[idx];
            showGraph(currentSeed);
            document.getElementById('graphPanel').classList.remove('d-none');
        }
    });

    // Close graph
    document.getElementById('close-graph')
        .onclick = () => document.getElementById('graphPanel').classList.add('d-none');
    document.getElementById('graph-regenerate')
        .onclick = () => currentSeed && showGraph(currentSeed);
})();

async function loadData() {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw Error(r.statusText);
    return (await r.json()).records || [];
}

function buildThemeFilters(records) {
    const container = document.getElementById('theme-filters');
    const badge = document.getElementById('theme-count');
    // domain -> set of topic names
    const map = {};
    records.forEach(r => (r.topics || [])
        .forEach(t => {
            const d = t.domain || '';
            if (!map[d]) map[d] = new Set();
            map[d].add(t.name);
        }));
    const domains = Object.keys(map).sort();
    badge.textContent = domains.reduce((sum, d) => sum + map[d].size, 0);
    domains.forEach(d => {
        const box = document.createElement('div');
        box.className = 'mb-2';
        box.innerHTML = `<strong>${d}</strong>`;
        const row = document.createElement('div');
        row.className = 'd-flex flex-wrap gap-2 mt-1';
        Array.from(map[d]).sort().forEach(name => {
            const id = `theme-${d}_${name}`.replace(/\W+/g, '_');
            const div = document.createElement('div');
            div.className = 'form-check form-check-inline';
            div.innerHTML = `
        <input class="form-check-input" type="checkbox" id="${id}" value="${name}">
        <label class="form-check-label" for="${id}">${name}</label>`;
            row.appendChild(div);
        });
        container.appendChild(box);
        container.appendChild(row);
    });
}

function buildStateFilters(records) {
    const c = document.getElementById('state-filters');
    const badge = document.getElementById('state-count');
    const set = new Set();
    records.forEach(r => (r.states || []).forEach(s => set.add(s)));
    const states = Array.from(set).sort();
    badge.textContent = states.length;
    states.forEach(name => {
        const id = `state-${name}`.replace(/\W+/g, '_');
        const div = document.createElement('div');
        div.className = 'form-check form-check-inline';
        div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${name}">
      <label class="form-check-label" for="${id}">${name}</label>`;
        c.appendChild(div);
    });
}

function getCheckedValues(containerId) {
    return Array.from(
        document.querySelectorAll(`#${containerId} input:checked`)
    ).map(i => i.value.toLowerCase());
}

function applyFilters() {
    const titleQ = (document.getElementById('search').value || '').trim().toLowerCase();
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    const themes = getCheckedValues('theme-filters');
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
    const make = (label, disc, fn) => {
        const li = document.createElement('li');
        li.className = `page-item${disc ? ' disabled' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'page-link'; btn.textContent = label;
        if (!disc) btn.onclick = fn;
        li.appendChild(btn);
        return li;
    };
    ul.appendChild(make('Previous', currentPage === 1, () => {
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

function setupSearch() {
    document.getElementById('search-btn').onclick = applyFilters;
}

function setupCSVButtons() {
    document.getElementById('download-csv').onclick = downloadSearchCSV;
    document.getElementById('download-graph-csv').onclick = downloadGraphCSV;
}

function downloadSearchCSV() {
    generateCSV(filteredRecords, 'crp_search.csv');
}

function downloadGraphCSV() {
    generateCSV(currentGraphNodes, 'crp_graph.csv');
}

function generateCSV(recs, filename) {
    const cols = [
        'url', 'is_oa', 'title', 'doi', 'type',
        'journal', 'publication_year', 'keywords', 'authors'
    ];
    const header = cols.join(',') + '\n';
    const lines = recs.map(r => {
        const map = {
            url: r.url || '',
            is_oa: r.is_oa ? 'Yes' : 'No',
            title: `"${r.title.replace(/"/g, '""')}"`,
            doi: r.doi || '',
            type: r.type || '',
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
    <p><strong>URL:</strong> <a href="${r.url || '#'}">${r.url || 'N/A'}</a></p>
  `;
    new bootstrap.Modal(document.getElementById('detailModal')).show();
}

function showGraph(seed) {
    const depth = parseInt(document.getElementById('graph-depth').value, 10) || 1;
    const nodes = [], edges = [];
    const seenN = new Set(), seenE = new Set();
    currentGraphNodes = [];  // reset

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

    function recurse(id, level) {
        if (level >= depth) return;
        const m = recordMap[id];
        (m.backward_citations || []).forEach(rid => {
            if (recordMap[rid]) {
                addNode(rid, recordMap[rid].title, 'backward', recordMap[rid]);
                addEdge(id, rid);
                recurse(rid, level + 1);
            }
        });
        (m.forward_citations || []).forEach(cid => {
            if (recordMap[cid]) {
                addNode(cid, recordMap[cid].title, 'forward', recordMap[cid]);
                addEdge(cid, id);
                recurse(cid, level + 1);
            }
        });
    }

    addNode(seed.id, seed.title, 'seed', seed);
    recurse(seed.id, 0);
    const els = nodes.concat(edges);
    const cont = document.getElementById('cy');
    cont.innerHTML = '';

    const cy = cytoscape({
        container: cont,
        elements: els,
        style: [
            {
                selector: 'node', style: {
                    width: 90, height: 90, label: 'data(label)',
                    'text-wrap': 'wrap', 'text-max-width': 150, 'font-size': 8,
                    'text-valign': 'center', color: '#000'
                }
            },
            { selector: 'node[metaType="seed"]', style: { 'background-color': '#0d6efd' } },
            { selector: 'node[metaType="backward"]', style: { 'background-color': 'green' } },
            { selector: 'node[metaType="forward"]', style: { 'background-color': 'yellow' } },
            { selector: 'edge', style: { width: 2, 'line-color': '#999' } }
        ]
    });
    cy.layout({ name: 'cose', idealEdgeLength: 120, nodeOverlap: 40, nodeRepulsion: 8000, gravity: 0.1, numIter: 500, tile: true }).run();
    cy.on('tap', 'node', evt => {
        const m = evt.target.data('meta');
        document.getElementById('node-info').textContent = m.title;
    });
}
