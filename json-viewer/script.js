const editor = document.getElementById("json-input");
const lineNumbers = document.getElementById("line-numbers");
const gutter = lineNumbers.parentElement;
const statusMessage = document.getElementById("status-message");
const treeContainer = document.getElementById("json-tree");
const searchInput = document.getElementById("json-search");
const fileInput = document.getElementById("file-input");

const LINE_HEIGHT = 22;
const GUTTER_PAD = 12;
const MAX_CHILDREN = 50;
const MAX_EXTRA_NODES = 400;
const MAX_SEARCH_MATCHES = 100;
const MAX_VISITED = 40000;
const MAX_PREVIEW = 80;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE = {
  product: "JSON Viewer",
  free: true,
  version: 1,
  updated: null,
  tags: ["tree", "search", "paths"],
  owner: { name: "Local tool", browserOnly: true }
};

const nodeState = new WeakMap();
const selectedPathValue = document.getElementById("selected-path-value");
let currentValue = null;
let lastRaw = null;
let hasTree = false;
let selectedPath = "";
let nodesRendered = 0;
let nodeBudget = Infinity;
let budgetHit = false;

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function countLines(text) {
  let total = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) total += 1;
  }
  return total;
}

function renderLineNumbers() {
  const total = countLines(editor.value);
  const start = Math.floor(editor.scrollTop / LINE_HEIGHT);
  const room = Math.ceil(editor.clientHeight / LINE_HEIGHT) + 2;
  const end = Math.min(total, start + room);
  const lines = [];
  for (let line = start + 1; line <= end; line += 1) lines.push(String(line));
  lineNumbers.textContent = lines.join("\n");
  const offset = GUTTER_PAD - (editor.scrollTop - start * LINE_HEIGHT);
  lineNumbers.style.transform = "translateY(" + offset + "px)";
  gutter.style.minWidth = Math.max(3, String(total).length + 1) + "ch";
}

function readJson() {
  const raw = editor.value;
  if (!raw.trim()) return { ok: false, message: "Paste JSON into the editor first." };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    const details = error && error.message ? error.message : "Unknown parsing error";
    return { ok: false, message: "Invalid JSON: " + details };
  }
}

function joinPath(parent, key) {
  if (typeof key === "number") return parent + "[" + key + "]";
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return parent + "." + key;
  return parent + "[" + JSON.stringify(key) + "]";
}

function ownValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor ? descriptor.value : undefined;
}

function previewValue(value) {
  if (value === null) return "null";
  if (typeof value === "string") {
    const shown = value.length > MAX_PREVIEW ? value.slice(0, MAX_PREVIEW) + "…" : value;
    return JSON.stringify(shown);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return "Array (" + value.length + ")";
  return "Object (" + Object.keys(value).length + ")";
}

function valueClass(value) {
  if (value === null) return "token-null";
  if (Array.isArray(value)) return "token-array";
  if (typeof value === "string") return "token-string";
  if (typeof value === "number") return "token-number";
  if (typeof value === "boolean") return "token-boolean";
  return "token-object";
}

function fillToken(element, text, query, active) {
  element.replaceChildren();
  if (!active || !query) {
    element.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(q, index);
    if (found === -1) {
      element.appendChild(document.createTextNode(text.slice(index)));
      break;
    }
    if (found > index) element.appendChild(document.createTextNode(text.slice(index, found)));
    const mark = document.createElement("mark");
    mark.className = "match";
    mark.textContent = text.slice(found, found + query.length);
    element.appendChild(mark);
    index = found + query.length;
  }
}

function nodeName(state) {
  if (state.label === null) return "JSON root";
  if (typeof state.label === "number") return "index " + state.label;
  return String(state.label);
}

function displayKey(label) {
  if (typeof label === "number") return "[" + label + "]";
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(label)) return label;
  return JSON.stringify(label);
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

function sourceCount(state) {
  if (state.visibleChildren) return state.visibleChildren.length;
  return state.childCount;
}

function readChild(state, index) {
  if (state.visibleChildren) return state.visibleChildren[index];
  if (Array.isArray(state.value)) {
    return { label: index, value: state.value[index], path: state.path + "[" + index + "]" };
  }
  const key = state.keys[index];
  return { label: key, value: ownValue(state.value, key), path: joinPath(state.path, key) };
}

function placeShowMore(state) {
  const old = state.childrenHost.querySelector(".show-more");
  if (old) old.remove();
  if (state.nextIndex >= sourceCount(state)) return;
  const remaining = sourceCount(state) - state.nextIndex;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "show-more";
  button.textContent = "Show " + Math.min(MAX_CHILDREN, remaining) + " more";
  button.addEventListener("click", function () {
    renderChildBatch(state, state.nextIndex);
  });
  state.childrenHost.appendChild(button);
}

function renderChildBatch(state, startIndex) {
  let index = startIndex;
  let appended = 0;
  while (index < sourceCount(state) && appended < MAX_CHILDREN) {
    if (nodesRendered >= nodeBudget) {
      budgetHit = true;
      break;
    }
    const child = readChild(state, index);
    const node = createNode(child.value, child.path, child.label, state.mode);
    if (!node) {
      budgetHit = true;
      break;
    }
    state.childrenHost.appendChild(node);
    index += 1;
    appended += 1;
  }
  state.nextIndex = index;
  placeShowMore(state);
}

function openNode(state) {
  if (!state || !state.expandable) return;
  state.expanded = true;
  state.toggle.textContent = "▾";
  state.toggle.setAttribute("aria-expanded", "true");
  state.toggle.setAttribute("aria-label", "Collapse " + nodeName(state));
  state.childrenHost.hidden = false;
  if (!state.childrenHost.querySelector(".tree-node") && state.nextIndex === 0) {
    renderChildBatch(state, 0);
  }
}

function closeNode(state) {
  state.expanded = false;
  state.nextIndex = 0;
  state.toggle.textContent = "▸";
  state.toggle.setAttribute("aria-expanded", "false");
  state.toggle.setAttribute("aria-label", "Expand " + nodeName(state));
  state.childrenHost.replaceChildren();
  state.childrenHost.hidden = true;
}

function createNode(value, path, label, mode) {
  if (nodesRendered >= nodeBudget) return null;
  nodesRendered += 1;
  const query = mode && mode.query ? mode.query : "";
  const q = query.toLowerCase();
  const keyMatch = label !== null && query && String(label).toLowerCase().indexOf(q) !== -1;
  const primitive = value === null || typeof value !== "object";
  const valueMatch = primitive && query && String(value).toLowerCase().indexOf(q) !== -1;
  const expandable = !primitive;

  const element = document.createElement("div");
  element.className = "tree-node";
  const row = document.createElement("div");
  row.className = "tree-row" + (keyMatch || valueMatch ? " is-match" : "");
  row.tabIndex = 0;

  let toggle = null;
  if (expandable) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    toggle.textContent = "▸";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Expand " + (label === null ? "JSON root" : String(label)));
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "toggle-spacer";
    spacer.setAttribute("aria-hidden", "true");
    row.appendChild(spacer);
  }

  if (label !== null) {
    const keyEl = document.createElement("span");
    keyEl.className = "token token-key";
    fillToken(keyEl, displayKey(label), query, keyMatch);
    row.appendChild(keyEl);
    const colon = document.createElement("span");
    colon.className = "token token-punct";
    colon.textContent = ":";
    row.appendChild(colon);
  }

  const valueEl = document.createElement("span");
  valueEl.className = "token " + valueClass(value);
  const shown = previewValue(value);
  fillToken(valueEl, shown, query, valueMatch && shown.toLowerCase().indexOf(q) !== -1);
  row.appendChild(valueEl);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "copy-path";
  copyBtn.textContent = "Copy path";
  copyBtn.setAttribute("aria-label", "Copy JSON path " + path);
  copyBtn.addEventListener("click", function () {
    copyText(path).then(function () {
      showStatus("Copied path " + path + ".", "success");
    }).catch(function () {
      showStatus("Could not copy the path. Select it from the status line and copy it manually: " + path, "error");
    });
  });
  row.appendChild(copyBtn);
  row.addEventListener("click", function () {
    selectRow(nodeState.get(element));
  });
  row.addEventListener("focusin", function () {
    selectRow(nodeState.get(element));
  });
  element.appendChild(row);

  const childrenHost = document.createElement("div");
  childrenHost.className = "tree-children";
  childrenHost.hidden = true;
  element.appendChild(childrenHost);

  const nextMode = {
    query: query,
    filter: !!(mode && mode.filter),
    expandPaths: mode && mode.expandPaths ? mode.expandPaths : null,
    visibleMap: mode && mode.visibleMap ? mode.visibleMap : null
  };

  const state = {
    element: element,
    value: value,
    path: path,
    label: label,
    expandable: expandable,
    toggle: toggle,
    childrenHost: childrenHost,
    expanded: false,
    nextIndex: 0,
    childCount: 0,
    keys: null,
    visibleChildren: null,
    mode: nextMode
  };

  if (expandable) {
    if (nextMode.filter && nextMode.visibleMap) {
      state.visibleChildren = nextMode.visibleMap.get(path) || [];
    } else if (Array.isArray(value)) {
      state.childCount = value.length;
    } else {
      state.keys = Object.keys(value);
      state.childCount = state.keys.length;
    }
    toggle.addEventListener("click", function () {
      if (state.expanded) closeNode(state);
      else openNode(state);
    });
  }

  nodeState.set(element, state);
  return element;
}

function resetSelectedPath() {
  selectedPath = "";
  selectedPathValue.textContent = "None";
}

function selectRow(state) {
  if (!state) return;
  const previous = treeContainer.querySelector(".tree-row.is-selected");
  if (previous) previous.classList.remove("is-selected");
  const row = state.element.querySelector(".tree-row");
  row.classList.add("is-selected");
  selectedPath = state.path;
  selectedPathValue.textContent = state.path;
}

function markSelectedRow() {
  if (!selectedPath) return;
  const nodes = treeContainer.querySelectorAll(".tree-node");
  for (let i = 0; i < nodes.length; i += 1) {
    const state = nodeState.get(nodes[i]);
    if (!state || state.path !== selectedPath) continue;
    nodes[i].querySelector(".tree-row").classList.add("is-selected");
    return;
  }
}

function showTree(value, mode) {
  nodesRendered = 0;
  nodeBudget = Infinity;
  budgetHit = false;
  treeContainer.replaceChildren();
  const root = createNode(value, "$", null, mode || { query: "" });
  treeContainer.appendChild(root);
  const rootState = nodeState.get(root);
  if (!mode || !mode.filter) {
    openNode(rootState);
    markSelectedRow();
    return;
  }
  const stack = [];
  if (mode.expandPaths && mode.expandPaths.has("$")) stack.push(rootState);
  while (stack.length) {
    const state = stack.pop();
    openNode(state);
    const kids = state.childrenHost.children;
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      if (!kids[i].classList.contains("tree-node")) continue;
      const childState = nodeState.get(kids[i]);
      if (childState && mode.expandPaths.has(childState.path)) stack.push(childState);
    }
  }
  markSelectedRow();
}

function clearTreeMessage(text) {
  treeContainer.replaceChildren();
  const note = document.createElement("p");
  note.className = "tree-empty";
  note.textContent = text;
  treeContainer.appendChild(note);
  hasTree = false;
  currentValue = null;
  lastRaw = null;
  resetSelectedPath();
}

function viewJson() {
  const result = readJson();
  if (!result.ok) {
    showStatus(result.message, "error");
    return;
  }
  currentValue = result.value;
  lastRaw = editor.value;
  hasTree = true;
  searchInput.value = "";
  resetSelectedPath();
  showTree(currentValue, null);
  showStatus("JSON tree updated.", "success");
}

function collectSearch(value, query) {
  const expandPaths = new Set(["$"]);
  const matchPaths = new Set();
  const visibleMap = new Map();
  const seen = new Map();
  const infoMap = new Map();
  infoMap.set("$", { label: null, value: value, parentPath: null, order: 0 });
  let matchCount = 0;
  let visited = 0;
  let truncated = false;
  const stack = [{ value: value, path: "$", label: null, parentPath: null, order: 0 }];
  const q = query.toLowerCase();

  function addVisible(parentPath, entry) {
    let names = seen.get(parentPath);
    if (!names) {
      names = new Set();
      seen.set(parentPath, names);
      visibleMap.set(parentPath, []);
    }
    if (names.has(entry.path)) return;
    names.add(entry.path);
    visibleMap.get(parentPath).push(entry);
  }

  function linkToRoot(item) {
    let currentPath = item.path;
    let currentLabel = item.label;
    let currentValue = item.value;
    let parentPath = item.parentPath;
    let order = item.order;
    while (parentPath !== null) {
      addVisible(parentPath, { path: currentPath, label: currentLabel, value: currentValue, order: order });
      const parentInfo = infoMap.get(parentPath);
      if (!parentInfo) break;
      currentPath = parentPath;
      currentLabel = parentInfo.label;
      currentValue = parentInfo.value;
      order = parentInfo.order;
      parentPath = parentInfo.parentPath;
    }
  }

  while (stack.length) {
    if (visited >= MAX_VISITED || matchCount >= MAX_SEARCH_MATCHES) {
      truncated = true;
      break;
    }
    const item = stack.pop();
    visited += 1;
    infoMap.set(item.path, item);
    const primitive = item.value === null || typeof item.value !== "object";
    const keyMatch = item.label !== null && String(item.label).toLowerCase().indexOf(q) !== -1;
    const valueMatch = primitive && String(item.value).toLowerCase().indexOf(q) !== -1;
    if (keyMatch || valueMatch) {
      matchCount += 1;
      matchPaths.add(item.path);
      expandPaths.add(item.path);
      linkToRoot(item);
      let ancestor = item.parentPath;
      while (ancestor) {
        expandPaths.add(ancestor);
        const parentInfo = infoMap.get(ancestor);
        ancestor = parentInfo ? parentInfo.parentPath : null;
      }
    }
    if (Array.isArray(item.value)) {
      for (let i = item.value.length - 1; i >= 0; i -= 1) {
        stack.push({
          value: item.value[i],
          path: item.path + "[" + i + "]",
          label: i,
          parentPath: item.path,
          order: i
        });
      }
    } else if (item.value && typeof item.value === "object") {
      const keys = Object.keys(item.value);
      for (let i = keys.length - 1; i >= 0; i -= 1) {
        stack.push({
          value: ownValue(item.value, keys[i]),
          path: joinPath(item.path, keys[i]),
          label: keys[i],
          parentPath: item.path,
          order: i
        });
      }
    }
  }

  visibleMap.forEach(function (list) {
    list.sort(function (a, b) { return a.order - b.order; });
  });

  return { expandPaths: expandPaths, visibleMap: visibleMap, matchCount: matchCount, truncated: truncated };
}

function applySearch() {
  const query = searchInput.value.trim();
  if (!hasTree) {
    showStatus("Choose View JSON before searching.", "error");
    return;
  }
  if (editor.value !== lastRaw) {
    showStatus("The editor changed. Choose View JSON to refresh the tree.", "error");
    return;
  }
  if (!query) {
    showTree(currentValue, null);
    showStatus("Search cleared.", "success");
    return;
  }
  const found = collectSearch(currentValue, query);
  if (!found.matchCount) {
    clearTreeKeepValue("No matching keys or values.");
    showStatus(found.truncated ? "No matches in the searched portion of this JSON." : "No matching keys or values.", "error");
    return;
  }
  showTree(currentValue, {
    query: query,
    filter: true,
    expandPaths: found.expandPaths,
    visibleMap: found.visibleMap
  });
  let message = "Found " + found.matchCount + (found.matchCount === 1 ? " match." : " matches.");
  if (found.truncated) message += " Search stopped at the safety limit.";
  showStatus(message, "success");
}

function clearTreeKeepValue(text) {
  treeContainer.replaceChildren();
  const note = document.createElement("p");
  note.className = "tree-empty";
  note.textContent = text;
  treeContainer.appendChild(note);
}

function expandAll() {
  if (!hasTree || !treeContainer.querySelector(".tree-node")) {
    showStatus("Choose View JSON before expanding the tree.", "error");
    return;
  }
  nodesRendered = treeContainer.querySelectorAll(".tree-node").length;
  nodeBudget = nodesRendered + MAX_EXTRA_NODES;
  budgetHit = false;
  const root = nodeState.get(treeContainer.querySelector(".tree-node"));
  const stack = [root];
  while (stack.length) {
    const state = stack.pop();
    if (!state || !state.expandable) continue;
    openNode(state);
    if (budgetHit) break;
    const kids = state.childrenHost.children;
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      if (kids[i].classList.contains("tree-node")) stack.push(nodeState.get(kids[i]));
    }
  }
  nodeBudget = Infinity;
  showStatus(
    budgetHit
      ? "Expanded the first part of the tree. Use Show more or open a branch for the rest."
      : "Expanded the visible branches.",
    "success"
  );
}

function collapseAll() {
  const root = treeContainer.querySelector(".tree-node");
  if (!root) {
    showStatus("Choose View JSON before collapsing the tree.", "error");
    return;
  }
  const state = nodeState.get(root);
  if (state && state.expandable) closeNode(state);
  showStatus("Collapsed the tree.", "success");
}

document.getElementById("view-btn").addEventListener("click", viewJson);
document.getElementById("expand-btn").addEventListener("click", expandAll);
document.getElementById("collapse-btn").addEventListener("click", collapseAll);
document.getElementById("sample-btn").addEventListener("click", function () {
  editor.value = JSON.stringify(SAMPLE, null, 2);
  renderLineNumbers();
  viewJson();
  showStatus("Sample JSON loaded.", "success");
});
function resetFileInput() {
  fileInput.value = "";
}

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  searchInput.value = "";
  resetFileInput();
  renderLineNumbers();
  clearTreeMessage("Paste JSON and choose View JSON to see the tree.");
  showStatus("Editor cleared.", "success");
  editor.focus();
});

fileInput.addEventListener("change", function () {
  const file = fileInput.files && fileInput.files[0];
  resetFileInput();
  if (!file) return;
  if (file.size === 0) {
    showStatus("This file is empty. Choose a JSON file with content.", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showStatus("This file is larger than 5 MiB. Choose a JSON file of 5 MiB or smaller.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    const text = typeof reader.result === "string" ? reader.result : "";
    if (!text.trim()) {
      showStatus("This file contains only whitespace. Choose a file with JSON content.", "error");
      return;
    }
    editor.value = text;
    renderLineNumbers();
    const parsed = readJson();
    if (!parsed.ok) {
      clearTreeMessage("This file is not valid JSON.");
      showStatus(parsed.message, "error");
      return;
    }
    viewJson();
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
document.getElementById("copy-json-btn").addEventListener("click", function () {
  const result = readJson();
  if (!result.ok) {
    showStatus(result.message, "error");
    return;
  }
  const formatted = JSON.stringify(result.value, null, 2);
  copyText(formatted).then(function () {
    showStatus("Formatted JSON copied.", "success");
  }).catch(function () {
    showStatus("Could not copy JSON. Select the editor text and press Ctrl+C.", "error");
  });
});

searchInput.addEventListener("input", applySearch);
editor.addEventListener("input", renderLineNumbers);
editor.addEventListener("scroll", renderLineNumbers);
window.addEventListener("resize", renderLineNumbers);
renderLineNumbers();
