const MAX_INPUT_CHARS = 12000000;
const PREVIEW_ROW_LIMIT = 100;

const SAMPLE = [
  {
    name: "Ali Khan",
    email: "ali@example.com",
    age: 30,
    active: true,
    address: { city: "Karachi", country: "Pakistan" },
    tags: ["design", "json"]
  },
  {
    name: "Sara Ahmed",
    email: "sara@example.com",
    age: 27,
    active: false,
    address: { city: "Lahore", country: "Pakistan" },
    tags: ["data"]
  }
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rememberCollision(collisions, name, firstRecord, secondRecord) {
  for (let i = 0; i < collisions.length; i += 1) {
    if (collisions[i].name === name) return;
  }
  collisions.push({ name: name, first: firstRecord, second: secondRecord });
}

function assignCell(row, path, segments, text, collisions, columnPaths, objectNumber) {
  const signature = JSON.stringify(segments);
  const known = columnPaths.get(path);
  if (known) {
    if (known.signature !== signature) {
      rememberCollision(collisions, path, known.record, objectNumber);
      return;
    }
  } else {
    columnPaths.set(path, { signature: signature, record: objectNumber });
  }
  if (Object.prototype.hasOwnProperty.call(row, path)) return;
  row[path] = text;
}

function flattenInto(value, prefix, segments, row, collisions, columnPaths, objectNumber) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const path = prefix ? prefix + "." + key : key;
    const nextSegments = segments.concat(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const child = descriptor ? descriptor.value : undefined;
    if (isPlainObject(child)) {
      if (Object.keys(child).length === 0) {
        assignCell(row, path, nextSegments, "{}", collisions, columnPaths, objectNumber);
      } else {
        flattenInto(child, path, nextSegments, row, collisions, columnPaths, objectNumber);
      }
    } else if (Array.isArray(child)) {
      assignCell(row, path, nextSegments, JSON.stringify(child), collisions, columnPaths, objectNumber);
    } else if (child === null) {
      assignCell(row, path, nextSegments, "null", collisions, columnPaths, objectNumber);
    } else if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      assignCell(row, path, nextSegments, String(child), collisions, columnPaths, objectNumber);
    } else {
      assignCell(row, path, nextSegments, JSON.stringify(child), collisions, columnPaths, objectNumber);
    }
  }
}

function collisionMessage(collisions) {
  const quoted = collisions.map(function (collision) {
    return '"' + collision.name + '"';
  }).join(", ");
  const columnWord = collisions.length === 1 ? "Column " : "Columns ";
  const verb = collisions.length === 1 ? "comes" : "come";
  const sameObject = collisions.every(function (collision) {
    return collision.first === collision.second;
  });
  if (sameObject) {
    return columnWord + quoted + " " + verb + " from more than one property path in object " + collisions[0].first + ". Conversion stopped so values are not overwritten.";
  }
  const samePair = collisions.every(function (collision) {
    return collision.first === collisions[0].first && collision.second === collisions[0].second;
  });
  if (samePair) {
    return columnWord + quoted + " " + verb + " from different property paths in object " + collisions[0].first + " and object " + collisions[0].second + ". Conversion stopped so values are not overwritten.";
  }
  const details = collisions.map(function (collision) {
    return '"' + collision.name + '" in object ' + collision.first + " and object " + collision.second;
  }).join(", ");
  return "These columns come from different property paths: " + details + ". Conversion stopped so values are not overwritten.";
}

function buildTable(records) {
  const rows = [];
  const columnPaths = new Map();
  for (let i = 0; i < records.length; i += 1) {
    const row = {};
    const collisions = [];
    flattenInto(records[i], "", [], row, collisions, columnPaths, i + 1);
    if (collisions.length > 0) {
      return { error: collisionMessage(collisions) };
    }
    rows.push(row);
  }
  const columns = [];
  const seen = new Set();
  rows.forEach(function (row) {
    Object.keys(row).forEach(function (key) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    });
  });
  return { columns: columns, rows: rows };
}

function explainRoot(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "This JSON array is empty, so there are no rows to convert.";
    }
    const allObjects = value.every(isPlainObject);
    if (!allObjects) {
      return "A top-level array can be converted when every item is an object. This array contains another kind of value, so one table would be misleading.";
    }
    return "";
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) {
      return "This JSON object has no properties, so there are no columns to convert.";
    }
    return "";
  }
  const kind = value === null ? "null" : typeof value;
  return "The JSON root is a single " + kind + ". Paste an object or an array of objects to build a CSV table.";
}

function recordsFrom(value) {
  if (Array.isArray(value)) return value;
  return [value];
}

function findRowSources(value) {
  const sources = [];
  function walk(node, path) {
    if (!isPlainObject(node)) return;
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      const child = descriptor ? descriptor.value : undefined;
      const nextPath = path.concat(key);
      if (Array.isArray(child)) {
        if (child.every(isPlainObject)) {
          sources.push({ path: nextPath, count: child.length });
        }
      } else if (isPlainObject(child)) {
        walk(child, nextPath);
      }
    }
  }
  walk(value, []);
  return sources;
}

function valueAtPath(value, path) {
  let current = value;
  for (let i = 0; i < path.length; i += 1) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, path[i])) {
      return { ok: false };
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, path[i]);
    current = descriptor ? descriptor.value : undefined;
  }
  return { ok: true, value: current };
}

function formatSourcePath(path) {
  const dotted = path.every(function (key) {
    return key.length > 0 && key.indexOf(".") === -1 && key.indexOf("[") === -1 && key.indexOf("]") === -1;
  });
  if (dotted) return path.join(".");
  return path.map(function (key) {
    return "[" + JSON.stringify(key) + "]";
  }).join("");
}

function formatSourceLabel(source) {
  const noun = source.count === 1 ? "object" : "objects";
  return formatSourcePath(source.path) + " (" + source.count + " " + noun + ")";
}

function escapeField(value, delimiter, spreadsheetSafe) {
  let text = value == null ? "" : String(value);
  if (spreadsheetSafe && /^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  const mustQuote = text.indexOf('"') !== -1 || text.indexOf(delimiter) !== -1 || text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1 || text.charAt(0) === " " || text.charAt(text.length - 1) === " ";
  if (!mustQuote) return text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function tableToCsv(table, options) {
  const delimiter = options.delimiter;
  const lines = [];
  if (options.includeHeaders) {
    lines.push(table.columns.map(function (column) {
      return escapeField(column, delimiter, options.spreadsheetSafe);
    }).join(delimiter));
  }
  table.rows.forEach(function (row) {
    lines.push(table.columns.map(function (column) {
      return escapeField(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : "", delimiter, options.spreadsheetSafe);
    }).join(delimiter));
  });
  return lines.join("\r\n");
}

function convertValue(value, options) {
  let source = value;
  const rowPath = options && options.rowPath;
  if (rowPath && rowPath.length) {
    const found = valueAtPath(value, rowPath);
    if (!found.ok || !Array.isArray(found.value)) {
      return { ok: false, message: "The selected array is no longer in this JSON. Choose Whole JSON or another array." };
    }
    source = found.value;
  }
  const problem = explainRoot(source);
  if (problem) return { ok: false, message: problem };
  const table = buildTable(recordsFrom(source));
  if (table.error) return { ok: false, message: table.error };
  if (table.columns.length === 0) {
    return { ok: false, message: "These objects have no properties, so the CSV has no columns." };
  }
  return {
    ok: true,
    csv: tableToCsv(table, options),
    columns: table.columns,
    rows: table.rows,
    recordCount: table.rows.length
  };
}

/* DOM */
const editor = document.getElementById("json-input");
const statusMessage = document.getElementById("status-message");
const fileInput = document.getElementById("file-input");
const delimiterInput = document.getElementById("delimiter");
const headersInput = document.getElementById("headers-input");
const safeInput = document.getElementById("safe-input");
const rowSourceInput = document.getElementById("row-source");
let rowSources = [];
let rebuildingSources = false;
const previewTable = document.getElementById("preview-table");
const previewHead = previewTable.querySelector("thead");
const previewBody = previewTable.querySelector("tbody");
const previewEmpty = document.getElementById("preview-empty");
const previewCount = document.getElementById("preview-count");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function currentRowPath() {
  if (!rowSourceInput.value) return null;
  const source = rowSources[Number(rowSourceInput.value)];
  if (!source) return null;
  return source.path.slice();
}

function resetRowSourceSelect() {
  rowSources = [];
  rebuildingSources = true;
  rowSourceInput.replaceChildren();
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Whole JSON";
  rowSourceInput.appendChild(option);
  rowSourceInput.value = "";
  rebuildingSources = false;
}

function rebuildRowSourceSelect(value) {
  const previousKey = JSON.stringify(currentRowPath() || []);
  rowSources = findRowSources(value);
  rebuildingSources = true;
  rowSourceInput.replaceChildren();
  const whole = document.createElement("option");
  whole.value = "";
  whole.textContent = "Whole JSON";
  rowSourceInput.appendChild(whole);
  let nextValue = "";
  rowSources.forEach(function (source, index) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = formatSourceLabel(source);
    rowSourceInput.appendChild(option);
    if (previousKey === JSON.stringify(source.path)) nextValue = String(index);
  });
  rowSourceInput.value = nextValue;
  rebuildingSources = false;
}

function currentOptions() {
  const selected = delimiterInput.value;
  return {
    delimiter: selected === "tab" ? "\t" : selected,
    includeHeaders: headersInput.checked,
    spreadsheetSafe: safeInput.checked,
    rowPath: currentRowPath()
  };
}

function readEditor() {
  const raw = editor.value;
  if (!raw.trim()) return { ok: false, message: "Paste JSON or upload a .json file first." };
  if (raw.length > MAX_INPUT_CHARS) {
    return { ok: false, message: "This pasted JSON is longer than 12,000,000 characters and was not converted." };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    const details = error && error.message ? error.message : "The text is not valid JSON.";
    return { ok: false, message: "Invalid JSON: " + details };
  }
}

function clearPreview() {
  previewHead.replaceChildren();
  previewBody.replaceChildren();
  previewTable.hidden = true;
  previewEmpty.hidden = false;
  previewEmpty.textContent = "Convert JSON to see a CSV preview.";
  previewCount.textContent = "No rows yet";
}

function renderPreview(result) {
  previewHead.replaceChildren();
  previewBody.replaceChildren();
  const headerRow = document.createElement("tr");
  result.columns.forEach(function (column) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    headerRow.appendChild(cell);
  });
  if (currentOptions().includeHeaders) previewHead.appendChild(headerRow);

  const shown = Math.min(result.rows.length, PREVIEW_ROW_LIMIT);
  for (let i = 0; i < shown; i += 1) {
    const tr = document.createElement("tr");
    result.columns.forEach(function (column) {
      const td = document.createElement("td");
      td.textContent = Object.prototype.hasOwnProperty.call(result.rows[i], column) ? result.rows[i][column] : "";
      tr.appendChild(td);
    });
    previewBody.appendChild(tr);
  }
  previewTable.hidden = false;
  previewEmpty.hidden = true;
  const extra = result.recordCount > shown ? " Showing the first " + shown + " rows." : "";
  previewCount.textContent = result.recordCount + (result.recordCount === 1 ? " record, " : " records, ") + result.columns.length + (result.columns.length === 1 ? " column." : " columns.") + extra;
}

function runConversion() {
  const parsed = readEditor();
  if (!parsed.ok) {
    clearPreview();
    resetRowSourceSelect();
    showStatus(parsed.message, "error");
    return null;
  }
  const result = convertValue(parsed.value, currentOptions());
  rebuildRowSourceSelect(parsed.value);
  if (!result.ok) {
    clearPreview();
    showStatus(result.message, "error");
    return null;
  }
  renderPreview(result);
  showStatus("JSON converted to CSV.", "success");
  return result;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return fallbackCopy(text);
    });
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  return new Promise(function (resolve, reject) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(helper);
    if (ok) resolve();
    else reject(new Error("copy failed"));
  });
}

document.getElementById("convert-btn").addEventListener("click", runConversion);

document.getElementById("download-btn").addEventListener("click", function () {
  const result = runConversion();
  if (!result) return;
  const blob = new Blob(["\uFEFF" + result.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "converted-data.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Downloaded converted-data.csv.", "success");
});

document.getElementById("copy-btn").addEventListener("click", function () {
  const result = runConversion();
  if (!result) return;
  copyText(result.csv).then(function () {
    showStatus("CSV copied.", "success");
  }).catch(function () {
    showStatus("Could not copy the CSV. Use Download CSV instead.", "error");
  });
});

document.getElementById("sample-btn").addEventListener("click", function () {
  editor.value = JSON.stringify(SAMPLE, null, 2);
  resetRowSourceSelect();
  runConversion();
  showStatus("Sample JSON loaded and converted.", "success");
});

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  fileInput.value = "";
  resetRowSourceSelect();
  clearPreview();
  showStatus("Editor cleared.", "success");
  editor.focus();
});

editor.addEventListener("input", resetRowSourceSelect);

rowSourceInput.addEventListener("change", function () {
  if (rebuildingSources) return;
  if (editor.value.trim()) runConversion();
});

delimiterInput.addEventListener("change", function () {
  if (editor.value.trim()) runConversion();
});
headersInput.addEventListener("change", function () {
  if (editor.value.trim()) runConversion();
});
safeInput.addEventListener("change", function () {
  if (editor.value.trim()) runConversion();
});

fileInput.addEventListener("change", function () {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  if (file.size > MAX_INPUT_CHARS) {
    showStatus("This file is larger than 12,000,000 bytes and was not read.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    editor.value = typeof reader.result === "string" ? reader.result : "";
    resetRowSourceSelect();
    runConversion();
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
