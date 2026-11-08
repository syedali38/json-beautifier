import { isMap, isPair, isScalar, isSeq, parseDocument } from "../json-to-yaml/vendor/yaml.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_CHARS = 5000000;
const PARSE_OPTIONS = {
  version: "1.2",
  schema: "core",
  logLevel: "error",
  uniqueKeys: true,
  maxAliasCount: 100,
  intAsBigInt: false
};

const SAMPLE = [
  "name: Ada",
  "active: true",
  "score: null",
  "tags:",
  "  - yaml",
  "  - json",
  "address: {}",
  "notes: []",
  "flag: yes",
  "code: \"01\""
].join("\n");

export function convertYaml(text) {
  if (!text.trim()) {
    return { ok: false, message: "Paste YAML or open a .yaml or .yml file first." };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, message: "This YAML is longer than 5,000,000 characters and was not converted." };
  }

  let doc;
  try {
    doc = parseDocument(text, PARSE_OPTIONS);
  } catch (error) {
    return { ok: false, message: "This YAML cannot be converted to JSON." };
  }

  if (doc.errors.length > 0) {
    const failure = doc.errors[0];
    if (failure.code === "MULTIPLE_DOCS") {
      return { ok: false, message: "Only one YAML document can be converted." };
    }
    if (failure.code === "DUPLICATE_KEY") {
      return { ok: false, message: "YAML mapping keys must be unique." };
    }
    const details = failure.message ? failure.message : "The text is not valid YAML.";
    return { ok: false, message: "Invalid YAML: " + details };
  }

  const tagWarning = doc.warnings.some(function (warning) {
    return warning.code === "TAG_RESOLVE_FAILED";
  });
  if (tagWarning) {
    return { ok: false, message: "This YAML cannot be converted to JSON. An unsupported tag was found." };
  }
  if (doc.contents == null) {
    return { ok: false, message: "Paste YAML or open a .yaml or .yml file first." };
  }
  if (containsMergeKey(doc.contents, new Set())) {
    return { ok: false, message: "This YAML cannot be converted to JSON. Merge keys are not expanded." };
  }

  let value;
  try {
    value = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    if (error instanceof ReferenceError) {
      return { ok: false, message: "This YAML cannot be converted to JSON. Alias expansion was stopped." };
    }
    return { ok: false, message: "This YAML cannot be converted to JSON." };
  }

  const problem = findNonJsonValue(value, new Set());
  if (problem) return { ok: false, message: problem };

  try {
    const json = JSON.stringify(value, null, 2);
    if (typeof json !== "string") {
      return { ok: false, message: "This YAML cannot be converted to JSON." };
    }
    return { ok: true, json: json };
  } catch (error) {
    return { ok: false, message: "This YAML cannot be converted to JSON." };
  }
}

function containsMergeKey(node, seen) {
  if (node == null || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  if (isPair(node)) {
    return isPlainMerge(node.key) || containsMergeKey(node.value, seen);
  }
  if (isMap(node) || isSeq(node)) {
    for (let i = 0; i < node.items.length; i += 1) {
      if (containsMergeKey(node.items[i], seen)) return true;
    }
  }
  return false;
}

function isPlainMerge(node) {
  return isScalar(node) && node.value === "<<" && (!node.type || node.type === "PLAIN");
}

function findNonJsonValue(value, seen) {
  if (value === null) return "";
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return "";
  if (kind === "number") {
    if (!Number.isFinite(value)) {
      return "This YAML cannot be converted to JSON. A value is not a finite JSON number.";
    }
    return "";
  }
  if (kind !== "object") {
    return "This YAML cannot be converted to JSON.";
  }
  if (seen.has(value)) {
    return "This YAML cannot be converted to JSON. A circular alias was found.";
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return "This YAML cannot be converted to JSON. Binary data is not supported.";
  }
  if (value instanceof Date) {
    return "This YAML cannot be converted to JSON.";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        return "This YAML cannot be converted to JSON.";
      }
      const problem = findNonJsonValue(value[i], seen);
      if (problem) return problem;
    }
    seen.delete(value);
    return "";
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return "This YAML cannot be converted to JSON.";
  }
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const problem = findNonJsonValue(value[keys[i]], seen);
    if (problem) return problem;
  }
  seen.delete(value);
  return "";
}

if (typeof document !== "undefined") {
  const editor = document.getElementById("yaml-input");
  const fileInput = document.getElementById("file-input");
  const statusMessage = document.getElementById("status-message");
  const jsonOutput = document.getElementById("json-output");
  const jsonEmpty = document.getElementById("json-empty");
  let currentJson = "";

  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = "status" + (type ? " " + type : "");
  }

  function showJson(text) {
    currentJson = text;
    jsonOutput.textContent = text;
    jsonOutput.hidden = false;
    jsonEmpty.hidden = true;
  }

  function clearOutput() {
    currentJson = "";
    jsonOutput.textContent = "";
    jsonOutput.hidden = true;
    jsonEmpty.hidden = false;
  }

  function convertEditor() {
    const result = convertYaml(editor.value);
    if (!result.ok) {
      clearOutput();
      showStatus(result.message, "error");
      return null;
    }
    showJson(result.json);
    showStatus("YAML converted to JSON.", "success");
    return result.json;
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

  document.getElementById("convert-btn").addEventListener("click", convertEditor);

  document.getElementById("copy-btn").addEventListener("click", function () {
    if (!currentJson) {
      showStatus("Convert YAML to JSON before copying.", "error");
      return;
    }
    copyText(currentJson).then(function () {
      showStatus("JSON copied.", "success");
    }).catch(function () {
      showStatus("Could not copy the JSON. Use Download JSON instead.", "error");
    });
  });

  document.getElementById("download-btn").addEventListener("click", function () {
    if (!currentJson) {
      showStatus("Convert YAML to JSON before downloading.", "error");
      return;
    }
    const blob = new Blob([currentJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "converted-data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus("Downloaded converted-data.json.", "success");
  });

  document.getElementById("sample-btn").addEventListener("click", function () {
    editor.value = SAMPLE;
    convertEditor();
    if (currentJson) showStatus("Sample YAML loaded and converted.", "success");
  });

  document.getElementById("clear-btn").addEventListener("click", function () {
    editor.value = "";
    fileInput.value = "";
    clearOutput();
    showStatus("Editor cleared.", "success");
    editor.focus();
  });

  editor.addEventListener("input", function () {
    if (!currentJson) return;
    clearOutput();
    showStatus("", "");
  });

  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size === 0) {
      showStatus("This file is empty. Choose a YAML file with content.", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showStatus("This file is larger than 5 MiB and was not read.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const text = typeof reader.result === "string" ? reader.result : "";
      editor.value = text;
      const result = convertYaml(text);
      if (!result.ok) {
        clearOutput();
        showStatus(result.message, "error");
        return;
      }
      showJson(result.json);
      showStatus("YAML file converted to JSON.", "success");
    };
    reader.onerror = function () {
      showStatus("The file could not be read. Choose a .yaml or .yml text file and try again.", "error");
    };
    reader.readAsText(file);
  });
}
