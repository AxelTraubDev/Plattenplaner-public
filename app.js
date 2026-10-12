const STORAGE_KEY = 'plattenplaner-pwa-v1';

const defaultSheets = [
  { id: createId(), name: 'OSB 2500 x 1250', length: 2500, width: 1250, active: true },
  { id: createId(), name: 'OSB 2800 x 1250', length: 2800, width: 1250, active: true },
  { id: createId(), name: 'Spanplatte 2050 x 925', length: 2050, width: 925, active: false },
  { id: createId(), name: 'Multiplex 3000 x 1500', length: 3000, width: 1500, active: false }
];

const state = loadState();

const el = {
  areaLength: document.getElementById('areaLength'),
  areaWidth: document.getElementById('areaWidth'),
  kerf: document.getElementById('kerf'),
  allowRotation: document.getElementById('allowRotation'),
  drawAreaBtn: document.getElementById('drawAreaBtn'),
  resetBtn: document.getElementById('resetBtn'),
  drawing: document.getElementById('drawing'),
  sheetName: document.getElementById('sheetName'),
  sheetLength: document.getElementById('sheetLength'),
  sheetWidth: document.getElementById('sheetWidth'),
  addSheetBtn: document.getElementById('addSheetBtn'),
  loadDefaultsBtn: document.getElementById('loadDefaultsBtn'),
  sheetTableBody: document.querySelector('#sheetTable tbody'),
  calculateBtn: document.getElementById('calculateBtn'),
  result: document.getElementById('result'),
  layoutPreview: document.getElementById('layoutPreview')
};

init();

function init() {
  bindEvents();
  hydrateInputs();
  renderSheetTable();
  drawArea();
  drawPreview(null);
  saveState();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js');
    });
  }
}

function bindEvents() {
  el.drawAreaBtn.addEventListener('click', () => {
    syncAreaFromInputs();
    drawArea();
    saveState();
  });

  el.resetBtn.addEventListener('click', () => {
    state.area = { length: 4200, width: 2400, kerf: 4, allowRotation: true };
    hydrateInputs();
    drawArea();
    drawPreview(null);
    setResultMessage('Bitte Fläche prüfen und mindestens ein Plattenformat aktivieren.', true);
    saveState();
  });

  el.addSheetBtn.addEventListener('click', addSheetFromInputs);
  el.loadDefaultsBtn.addEventListener('click', loadDefaults);
  el.calculateBtn.addEventListener('click', calculateBestSheet);
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        area: { length: 4200, width: 2400, kerf: 4, allowRotation: true },
        sheets: [...defaultSheets]
      };
    }
    const parsed = JSON.parse(raw);
    return {
      area: {
        length: parsed.area?.length || 4200,
        width: parsed.area?.width || 2400,
        kerf: parsed.area?.kerf ?? 4,
        allowRotation: parsed.area?.allowRotation ?? true
      },
      sheets: Array.isArray(parsed.sheets) && parsed.sheets.length ? parsed.sheets : [...defaultSheets]
    };
  } catch {
    return {
      area: { length: 4200, width: 2400, kerf: 4, allowRotation: true },
      sheets: [...defaultSheets]
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function hydrateInputs() {
  el.areaLength.value = state.area.length;
  el.areaWidth.value = state.area.width;
  el.kerf.value = state.area.kerf;
  el.allowRotation.value = state.area.allowRotation ? 'yes' : 'no';
}

function syncAreaFromInputs() {
  state.area.length = toPositiveNumber(el.areaLength.value, 4200);
  state.area.width = toPositiveNumber(el.areaWidth.value, 2400);
  state.area.kerf = Math.max(0, Number(el.kerf.value) || 0);
  state.area.allowRotation = el.allowRotation.value === 'yes';
}

function addSheetFromInputs() {
  const name = el.sheetName.value.trim() || `Platte ${state.sheets.length + 1}`;
  const length = toPositiveNumber(el.sheetLength.value, 0);
  const width = toPositiveNumber(el.sheetWidth.value, 0);

  if (!length || !width) {
    alert('Bitte gültige Maße für das Plattenformat eingeben.');
    return;
  }

  state.sheets.push({
    id: createId(),
    name,
    length,
    width,
    active: true
  });

  el.sheetName.value = '';
  el.sheetLength.value = '2500';
  el.sheetWidth.value = '1250';

  renderSheetTable();
  saveState();
}

function loadDefaults() {
  const existingSignatures = new Set(
    state.sheets.map(s => `${s.name}|${s.length}|${s.width}`)
  );

  defaultSheets.forEach(sheet => {
    const signature = `${sheet.name}|${sheet.length}|${sheet.width}`;
    if (!existingSignatures.has(signature)) {
      state.sheets.push({
        id: createId(),
        name: sheet.name,
        length: sheet.length,
        width: sheet.width,
        active: sheet.active
      });
    }
  });

  renderSheetTable();
  saveState();
}

function removeSheet(id) {
  state.sheets = state.sheets.filter(sheet => sheet.id !== id);
  renderSheetTable();
  saveState();
}

function toggleSheet(id, checked) {
  const item = state.sheets.find(sheet => sheet.id === id);
  if (!item) return;
  item.active = checked;
  saveState();
}

function renderSheetTable() {
  el.sheetTableBody.innerHTML = '';

  state.sheets.forEach(sheet => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" ${sheet.active ? 'checked' : ''} data-id="${sheet.id}" class="sheet-toggle"></td>
      <td>${escapeHtml(sheet.name)}</td>
      <td>${formatNumber(sheet.length)} mm</td>
      <td>${formatNumber(sheet.width)} mm</td>
      <td>${formatSquareMeters(sheet.length * sheet.width)}</td>
      <td class="actions-cell">
        <button class="small-btn" data-remove-id="${sheet.id}">Löschen</button>
      </td>
    `;
    el.sheetTableBody.appendChild(tr);
  });

  el.sheetTableBody.querySelectorAll('.sheet-toggle').forEach(input => {
    input.addEventListener('change', event => {
      toggleSheet(event.target.dataset.id, event.target.checked);
    });
  });

  el.sheetTableBody.querySelectorAll('[data-remove-id]').forEach(button => {
    button.addEventListener('click', event => {
      removeSheet(event.target.dataset.removeId);
    });
  });
}

function calculateBestSheet() {
  syncAreaFromInputs();

  const activeSheets = state.sheets.filter(sheet => sheet.active);
  if (!activeSheets.length) {
    setResultMessage('Bitte mindestens ein Plattenformat aktivieren.', true);
    drawPreview(null);
    saveState();
    return;
  }

  const area = {
    length: state.area.length,
    width: state.area.width,
    kerf: state.area.kerf,
    allowRotation: state.area.allowRotation
  };

  const results = [];

  for (const sheet of activeSheets) {
    results.push(evaluateSheetOption(area, sheet, false));
    if (area.allowRotation && sheet.length !== sheet.width) {
      results.push(evaluateSheetOption(area, sheet, true));
    }
  }

  const validResults = results.filter(result => result !== null);
  if (!validResults.length) {
    setResultMessage('Für die gewählten Eingaben konnte keine gültige Variante berechnet werden.', true);
    drawPreview(null);
    saveState();
    return;
  }

  validResults.sort((a, b) => {
    if (a.wasteArea !== b.wasteArea) return a.wasteArea - b.wasteArea;
    if (a.sheetCount !== b.sheetCount) return a.sheetCount - b.sheetCount;
    return b.coveredArea - a.coveredArea;
  });

  const best = validResults[0];
  renderBestResult(best, validResults);
  drawPreview(best);
  saveState();
}

function evaluateSheetOption(area, sheet, rotated) {
  const sheetLength = rotated ? sheet.width : sheet.length;
  const sheetWidth = rotated ? sheet.length : sheet.width;

  const moduleLength = sheetLength + area.kerf;
  const moduleWidth = sheetWidth + area.kerf;

  const countX = Math.max(1, Math.ceil((area.length + area.kerf) / moduleLength));
  const countY = Math.max(1, Math.ceil((area.width + area.kerf) / moduleWidth));

  const pieces = [];
  let y = 0;

  for (let row = 0; row < countY; row++) {
    let x = 0;
    const remainingHeight = area.width - y;
    if (remainingHeight <= 0) break;

    const pieceHeight = Math.min(sheetWidth, remainingHeight);

    for (let col = 0; col < countX; col++) {
      const remainingWidth = area.length - x;
      if (remainingWidth <= 0) break;

      const pieceWidth = Math.min(sheetLength, remainingWidth);

      pieces.push({
        x,
        y,
        width: pieceWidth,
        height: pieceHeight,
        fullSheet: pieceWidth === sheetLength && pieceHeight === sheetWidth
      });

      x += sheetLength + area.kerf;
    }

    y += sheetWidth + area.kerf;
  }

  if (!pieces.length) return null;

  const sheetArea = sheetLength * sheetWidth;
  const areaTotal = area.length * area.width;
  const sheetCount = countX * countY;
  const usedRawArea = sheetCount * sheetArea;
  const wasteArea = Math.max(0, usedRawArea - areaTotal);
  const usageRate = areaTotal / usedRawArea;

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    originalLength: sheet.length,
    originalWidth: sheet.width,
    usedLength: sheetLength,
    usedWidth: sheetWidth,
    rotated,
    countX,
    countY,
    sheetCount,
    usedRawArea,
    coveredArea: areaTotal,
    wasteArea,
    usageRate,
    pieces
  };
}

function renderBestResult(best, allResults) {
  const altRows = allResults
    .slice(0, 5)
    .map(item => {
      const rotationLabel = item.rotated ? 'gedreht' : 'normal';
      return `
        <tr>
          <td>${escapeHtml(item.sheetName)}</td>
          <td>${formatNumber(item.usedLength)} × ${formatNumber(item.usedWidth)} mm</td>
          <td>${rotationLabel}</td>
          <td>${item.sheetCount}</td>
          <td>${formatSquareMeters(item.wasteArea)}</td>
          <td>${formatPercent(item.usageRate)}</td>
        </tr>
      `;
    })
    .join('');

  el.result.classList.remove('muted');
  el.result.innerHTML = `
    <p><span class="badge ok">Beste Variante</span></p>
    <p><strong>Plattenformat:</strong> ${escapeHtml(best.sheetName)}</p>
    <p><strong>Verwendetes Maß:</strong> ${formatNumber(best.usedLength)} × ${formatNumber(best.usedWidth)} mm ${best.rotated ? '(gedreht eingesetzt)' : ''}</p>
    <p><strong>Benötigte Platten:</strong> ${best.sheetCount}</p>
    <p><strong>Anordnung:</strong> ${best.countX} Spalten × ${best.countY} Reihen</p>
    <p><strong>Fläche gesamt:</strong> ${formatSquareMeters(best.coveredArea)}</p>
    <p><strong>Rohmaterial gesamt:</strong> ${formatSquareMeters(best.usedRawArea)}</p>
    <p><strong>Geschätzter Verschnitt:</strong> ${formatSquareMeters(best.wasteArea)}</p>
    <p><strong>Ausnutzung:</strong> ${formatPercent(best.usageRate)}</p>

    <h3>Verglichene Top-Varianten</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Maß</th>
            <th>Ausrichtung</th>
            <th>Platten</th>
            <th>Verschnitt</th>
            <th>Ausnutzung</th>
          </tr>
        </thead>
        <tbody>${altRows}</tbody>
      </table>
    </div>

    <p class="hint">
      Hinweis: Die Berechnung nutzt in dieser ersten Version eine rechteckige Rasterbelegung der Fläche und wählt die Variante mit dem geringsten rechnerischen Verschnitt.
    </p>
  `;
}

function setResultMessage(message, muted = false) {
  el.result.classList.toggle('muted', muted);
  el.result.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function drawArea() {
  const svg = el.drawing;
  const width = 900;
  const height = 500;
  const padding = 40;

  svg.innerHTML = '';

  const areaLength = state.area.length;
  const areaWidth = state.area.width;

  const scale = Math.min(
    (width - padding * 2) / areaLength,
    (height - padding * 2) / areaWidth
  );

  const drawWidth = areaLength * scale;
  const drawHeight = areaWidth * scale;
  const startX = (width - drawWidth) / 2;
  const startY = (height - drawHeight) / 2;

  svg.appendChild(svgRect(startX, startY, drawWidth, drawHeight, '#dbeafe', '#1f4b99', 2));
  svg.appendChild(svgText(startX + drawWidth / 2, startY - 10, `${formatNumber(areaLength)} mm`, 'middle', 16, '#1f2937'));
  svg.appendChild(svgText(startX - 10, startY + drawHeight / 2, `${formatNumber(areaWidth)} mm`, 'end', 16, '#1f2937', -90, startX - 10, startY + drawHeight / 2));

  svg.appendChild(svgLine(startX, startY + drawHeight + 14, startX + drawWidth, startY + drawHeight + 14, '#1f4b99'));
  svg.appendChild(svgLine(startX - 14, startY, startX - 14, startY + drawHeight, '#1f4b99'));
}

function drawPreview(best) {
  const svg = el.layoutPreview;
  const width = 900;
  const height = 500;
  const padding = 30;

  svg.innerHTML = '';

  if (!best) {
    svg.appendChild(svgText(width / 2, height / 2, 'Noch keine Berechnung vorhanden', 'middle', 20, '#6b7280'));
    return;
  }

  const areaLength = state.area.length;
  const areaWidth = state.area.width;

  const scale = Math.min(
    (width - padding * 2) / areaLength,
    (height - padding * 2) / areaWidth
  );

  const drawWidth = areaLength * scale;
  const drawHeight = areaWidth * scale;
  const startX = (width - drawWidth) / 2;
  const startY = (height - drawHeight) / 2;

  svg.appendChild(svgRect(startX, startY, drawWidth, drawHeight, '#f8fafc', '#94a3b8', 2));

  best.pieces.forEach((piece, index) => {
    const x = startX + piece.x * scale;
    const y = startY + piece.y * scale;
    const w = piece.width * scale;
    const h = piece.height * scale;
    const fill = piece.fullSheet ? '#bfdbfe' : '#fde68a';

    svg.appendChild(svgRect(x, y, w, h, fill, '#1f4b99', 1.5));

    const label = `P${index + 1}`;
    const lines = [
      label,
      `${Math.round(piece.width)} × ${Math.round(piece.height)}`
    ];

    const fontSize = Math.max(10, Math.min(15, Math.min(w, h) / 5));
    const centerX = x + w / 2;
    const centerY = y + h / 2;

    lines.forEach((line, lineIndex) => {
      svg.appendChild(
        svgText(
          centerX,
          centerY + (lineIndex * fontSize) - (fontSize * 0.35),
          line,
          'middle',
          fontSize,
          '#0f172a'
        )
      );
    });
  });

  const legendY = height - 18;
  svg.appendChild(svgRect(20, legendY - 12, 18, 12, '#bfdbfe', '#1f4b99', 1));
  svg.appendChild(svgText(45, legendY - 2, 'volle Platte', 'start', 14, '#475569'));
  svg.appendChild(svgRect(160, legendY - 12, 18, 12, '#fde68a', '#1f4b99', 1));
  svg.appendChild(svgText(185, legendY - 2, 'zugeschnittenes Stück', 'start', 14, '#475569'));
}

function svgRect(x, y, width, height, fill, stroke, strokeWidth) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  rect.setAttribute('fill', fill);
  rect.setAttribute('stroke', stroke);
  rect.setAttribute('stroke-width', strokeWidth);
  return rect;
}

function svgText(x, y, text, anchor = 'start', fontSize = 14, fill = '#111827', rotation = 0, cx = x, cy = y) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  node.setAttribute('x', x);
  node.setAttribute('y', y);
  node.setAttribute('text-anchor', anchor);
  node.setAttribute('font-size', fontSize);
  node.setAttribute('fill', fill);
  node.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
  if (rotation) {
    node.setAttribute('transform', `rotate(${rotation} ${cx} ${cy})`);
  }
  node.textContent = text;
  return node;
}

function svgLine(x1, y1, x2, y2, stroke = '#1f2937') {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', stroke);
  line.setAttribute('stroke-width', '2');
  return line;
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return parsed > 0 ? parsed : fallback;
}

function formatNumber(value) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
}

function formatSquareMeters(squareMillimeters) {
  return `${formatNumber(squareMillimeters / 1000000)} m²`;
}

function formatPercent(value) {
  return `${formatNumber(value * 100)} %`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
