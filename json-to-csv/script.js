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

function flattenInto(value, prefix, row) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const path = prefix ? prefix + "." + key : key;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const child = descriptor ? descriptor.value : undefined;
    if (isPlainObject(child)) {
      if (Object.keys(child).length === 0) {
        row[path] = "{}";
      } else {
        flattenInto(child, path, row);
      }
    } else if (Array.isArray(child)) {
      row[path] = JSON.stringify(child);
    } else if (child === null) {
      row[path] = "null";
    } else if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      row[path] = String(child);
    } else {
      row[path] = JSON.stringify(child);
    }
  }
}

function buildTable(records) {
  const rows = records.map(function (record) {
    const row = {};
    flattenInto(record, "", row);
    return row;
  });
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
  const problem = explainRoot(value);
  if (problem) return { ok: false, message: problem };
  const table = buildTable(recordsFrom(value));
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
const previewTable = document.getElementById("preview-table");
const previewHead = previewTable.querySelector("thead");
const previewBody = previewTable.querySelector("tbody");
const previewEmpty = document.getElementById("preview-empty");
const previewCount = document.getElementById("preview-count");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function currentOptions() {
  const selected = delimiterInput.value;
  return {
    delimiter: selected === "tab" ? "\t" : selected,
    includeHeaders: headersInput.checked,
    spreadsheetSafe: safeInput.checked
  };
}

function readEditor() {
  const raw = editor.value;
  if (!raw.trim()) return { ok: false, message: "Paste JSON or upload a .json file first." };
  if (raw.length > MAX_INPUT_CHARS) {
    return { ok: false, message: "This JSON is too large to convert in the browser. Try a file under 12 MB." };
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
    showStatus(parsed.message, "error");
    return null;
  }
  const result = convertValue(parsed.value, currentOptions());
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
  runConversion();
  showStatus("Sample JSON loaded and converted.", "success");
});

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  fileInput.value = "";
  clearPreview();
  showStatus("Editor cleared.", "success");
  editor.focus();
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
  if (!file) return;
  if (file.size > MAX_INPUT_CHARS) {
    showStatus("This file is too large to convert in the browser. Try a .json file under 12 MB.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    editor.value = typeof reader.result === "string" ? reader.result : "";
    runConversion();
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
