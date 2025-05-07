const DATA_URL = 'bobert_openalex_enhanced.json';



let allRecords = [], filteredRecords = [], recordMap = {};
let currentPage = 1, pageSize = 10, currentSeed = null;
let currentGraphNodes = [];

// Bootstrap collapse requires IDs; ensure those match your HTML:
//   #theme-filters, #state-filters, #search-btn, #download-csv, #results, #pagination, #detailModal, #graphPanel, etc.

(async function init() {
    // Load data
    try {
        allRecords = await loadData();
    } catch (err) {
        console.error('Failed to load data:', err);
        return;
    }
    allRecords.forEach(r => recordMap[r.id] = r);

    // Build filters
    buildThemeFilters(allRecords);
    buildStateFilters(allRecords);

    // Initial display
    filteredRecords = [...allRecords];
    renderTable();
    renderPagination();

    // Wire up search & CSV
    document.getElementById('search-btn').addEventListener('click', onSearch);
    document.getElementById('download-csv').addEventListener('click', downloadSearchCSV);
    document.getElementById('download-graph-csv').addEventListener('click', downloadGraphCSV);

    // Enter key on search input
    document.getElementById('search').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSearch();
        }
    });

    // Table button delegation
    document.getElementById('results').addEventListener('click', e => {
        if (e.target.classList.contains('network-btn')) {
            const tr = e.target.closest('tr');
            const rowIndex = Array.from(tr.parentNode.children).indexOf(tr);
            const globalIndex = (currentPage - 1) * pageSize + rowIndex;
            currentSeed = filteredRecords[globalIndex];
            showGraph(currentSeed);
            document.getElementById('graphPanel').classList.remove('d-none');
        }
        if (e.target.classList.contains('details-btn')) {
            const tr = e.target.closest('tr');
            const rowIndex = Array.from(tr.parentNode.children).indexOf(tr);
            const globalIndex = (currentPage - 1) * pageSize + rowIndex;
            showDetails(filteredRecords[globalIndex]);
        }
    });

    // Close/regenerate graph
    document.getElementById('close-graph').addEventListener('click', () =>
        document.getElementById('graphPanel').classList.add('d-none'));
    document.getElementById('graph-regenerate').addEventListener('click', () => {
        if (currentSeed) showGraph(currentSeed);
    });
})();

async function loadData() {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(resp.statusText);
    const json = await resp.json();
    return json.records || [];
}

function onSearch() {
    applyFilters();
    currentPage = 1;
    renderTable();
    renderPagination();
}

function buildThemeFilters(records) {
    const container = document.getElementById('theme-filters');
    const badge = document.getElementById('theme-count');
    // Build map: field -> domain -> Set(topics)
    const map = {};
    records.forEach(r => (r.topics || []).forEach(t => {
        const f = t.field || 'Unknown';
        const d = t.domain || 'Unknown';
        map[f] = map[f] || {};
        map[f][d] = map[f][d] || new Set();
        map[f][d].add(t.name);
    }));
    // Count total topics
    let total = 0;
    Object.values(map).forEach(dom => Object.values(dom).forEach(s => total += s.size));
    badge.textContent = total;

    // Render
    Object.keys(map).sort().forEach((fieldName, fi) => {
        const fieldId = `field-${fi}`;
        // Field button
        const fldDiv = document.createElement('div');
        fldDiv.className = 'mb-2';
        fldDiv.innerHTML = `
      <button class="btn btn-sm btn-outline-primary"
              data-bs-toggle="collapse"
              data-bs-target="#${fieldId}">
        ${fieldName}
      </button>
      <div id="${fieldId}" class="collapse ms-3 mt-1"></div>
    `;
        container.appendChild(fldDiv);
        const fldColl = fldDiv.querySelector(`#${fieldId}`);

        // Domains
        Object.keys(map[fieldName]).sort().forEach((domainName, di) => {
            const domId = `${fieldId}-dom-${di}`;
            const domDiv = document.createElement('div');
            domDiv.className = 'mb-1';
            domDiv.innerHTML = `
        <button class="btn btn-sm btn-outline-secondary"
                data-bs-toggle="collapse"
                data-bs-target="#${domId}">
          ${domainName}
        </button>
        <div id="${domId}" class="collapse ms-3 mt-1"></div>
      `;
            fldColl.appendChild(domDiv);
            const domColl = domDiv.querySelector(`#${domId}`);

            // Topics
            Array.from(map[fieldName][domainName]).sort().forEach(topic => {
                const chkId = `${domId}-${topic}`.replace(/\W+/g, '_');
                const chkDiv = document.createElement('div');
                chkDiv.className = 'form-check form-check-inline';
                chkDiv.innerHTML = `
          <input class="form-check-input" type="checkbox" id="${chkId}" value="${topic}">
          <label class="form-check-label" for="${chkId}">${topic}</label>
        `;
                domColl.appendChild(chkDiv);
            });
        });
    });
}

function buildStateFilters(records) {
    const container = document.getElementById('state-filters');
    const badge = document.getElementById('state-count');
    const set = new Set();
    records.forEach(r => (r.states || []).forEach(s => set.add(s)));
    const arr = Array.from(set).sort();
    badge.textContent = arr.length;
    arr.forEach(state => {
        const id = `state-${state}`.replace(/\W+/g, '_');
        const div = document.createElement('div');
        div.className = 'form-check form-check-inline';
        div.innerHTML = `
      <input class="form-check-input" type="checkbox" id="${id}" value="${state}">
      <label class="form-check-label" for="${id}">${state}</label>
    `;
        container.appendChild(div);
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
            const tNames = (r.topics || []).map(t => t.name.toLowerCase());
            if (!themes.some(t => tNames.includes(t))) return false;
        }
        if (states.length) {
            const sNames = (r.states || []).map(s => s.toLowerCase());
            if (!states.some(s => sNames.includes(s))) return false;
        }
        if (authorQ) {
            const aNames = r.authors.map(a => a.name).join(' ').toLowerCase();
            if (!aNames.includes(authorQ)) return false;
        }
        if (journalQ && !r.journal.toLowerCase().includes(journalQ)) return false;
        if (keywordQ) {
            const kWords = (r.keywords || []).join(' ').toLowerCase();
            if (!kWords.includes(keywordQ)) return false;
        }
        const cites = r.citation_counts.forward || 0;
        if (cites < minC || cites > maxC) return false;

        return true;
    });
}

function renderTable() {
    const tbody = document.querySelector('#results tbody');
    tbody.innerHTML = '';
    const start = (currentPage - 1) * pageSize;
    const pageRecords = filteredRecords.slice(start, start + pageSize);

    if (pageRecords.length === 0) {
        tbody.innerHTML = `
      <tr><td colspan="8" class="text-center py-3">
        No records match filters.
      </td></tr>`;
        return;
    }

    for (const r of pageRecords) {
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
    }
}

function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    const ul = document.getElementById('pagination');
    ul.innerHTML = '';

    function pageItem(label, disabled, clickHandler, active = false) {
        const li = document.createElement('li');
        li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'page-link';
        btn.textContent = label;
        if (!disabled && clickHandler) btn.addEventListener('click', clickHandler);
        li.appendChild(btn);
        return li;
    }

    // Previous
    ul.appendChild(pageItem('Prev',
        currentPage === 1,
        () => { currentPage--; updateView(); }
    ));

    // Page numbers with ellipses
    const visiblePages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) visiblePages.push(i);
    } else {
        visiblePages.push(1);
        if (currentPage > 4) visiblePages.push('...');
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) visiblePages.push(i);
        if (currentPage < totalPages - 3) visiblePages.push('...');
        visiblePages.push(totalPages);
    }

    for (const p of visiblePages) {
        if (p === '...') {
            const li = document.createElement('li');
            li.className = 'page-item disabled';
            li.innerHTML = `<span class="page-link">…</span>`;
            ul.appendChild(li);
        } else {
            ul.appendChild(pageItem(
                p,
                false,
                () => { currentPage = p; updateView(); },
                p === currentPage
            ));
        }
    }

    // Next
    ul.appendChild(pageItem('Next',
        currentPage === totalPages,
        () => { currentPage++; updateView(); }
    ));
}

function updateView() {
    renderTable();
    renderPagination();
}

// CSV download for search results
function downloadSearchCSV() {
    generateCSV(filteredRecords, 'crp_search.csv');
}

// CSV download for graph nodes
function downloadGraphCSV() {
    generateCSV(currentGraphNodes, 'crp_graph.csv');
}

function generateCSV(records, filename) {
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

    const elements = nodes.concat(edges);
    const container = document.getElementById('cy');
    container.innerHTML = '';

    const cy = cytoscape({
        container,
        elements,
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
            { selector: 'edge', style: { width: 2, 'line-color': '#999' } }
        ]
    });
    cy.layout({
        name: 'cose', idealEdgeLength: 120, nodeOverlap: 40,
        nodeRepulsion: 8000, gravity: 0.1, numIter: 500, tile: true
    }).run();

    cy.on('tap', 'node', evt => {
        document.getElementById('node-info').textContent = evt.target.data('label');
    });
}
