// app.js – InterviewAI Application Logic

// ─── GUARD: ensure data.js loaded ─────────────────
if (typeof QUESTIONS_DB === "undefined") {
  console.error("InterviewAI: QUESTIONS_DB not found. Make sure data.js is loaded before app.js.");
}

// ─── STATE ────────────────────────────────────────
let selectedDifficulty = "Easy";
let currentQuestions = [];
let savedQuestions = [];
let savedSets = [];

// Safe load from localStorage
try {
  savedQuestions = JSON.parse(localStorage.getItem("savedQuestions") || "[]");
} catch (e) { savedQuestions = []; }
try {
  savedSets = JSON.parse(localStorage.getItem("savedSets") || "[]");
} catch (e) { savedSets = []; }

// ─── DOM REFS ─────────────────────────────────────
const roleSelect = document.getElementById("role-select");
const levelSelect = document.getElementById("level-select");
const categorySelect = document.getElementById("category-select");
const countSelect = document.getElementById("count-select");
const customFocus = document.getElementById("custom-focus");
const generateBtn = document.getElementById("generate-btn");
const resultSection = document.getElementById("results-section");
const resultsMeta = document.getElementById("results-meta");
const questionsList = document.getElementById("questions-list");
const saveBtn = document.getElementById("save-btn");
const exportBtn = document.getElementById("export-btn");
const resetBtn = document.getElementById("reset-btn");
const savedList = document.getElementById("saved-list");

// ─── DIFFICULTY BUTTONS ───────────────────────────
document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedDifficulty = btn.dataset.diff;
  });
});

// ─── GENERATE ─────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  const role = roleSelect.value;
  const level = levelSelect.value;
  const category = categorySelect.value;
  const count = parseInt(countSelect.value);
  const focus = customFocus.value.trim();

  if (!role || !level) {
    showToast("⚠ Please select a Role and Level");
    return;
  }

  // Check DB is available
  if (typeof QUESTIONS_DB === "undefined" || !QUESTIONS_DB.length) {
    showToast("⚠ Question database not loaded. Check data.js.");
    return;
  }

  generateBtn.disabled = true;
  generateBtn.querySelector("span:last-child").textContent = "Generating…";
  generateBtn.querySelector(".btn-icon").textContent = "⏳";
  generateBtn.classList.add("loading");

  // Filter from local DB
  let pool = QUESTIONS_DB.filter(q => q.role === role && q.level === level);
  if (category !== "All") pool = pool.filter(q => q.category === category);
  if (selectedDifficulty !== "Mixed") pool = pool.filter(q => q.difficulty === selectedDifficulty);

  // Custom focus: prefer matching questions but keep others as fallback
  if (focus) {
    const focusLower = focus.toLowerCase();
    const focused = pool.filter(q =>
      q.question.toLowerCase().includes(focusLower) ||
      (q.hint && q.hint.toLowerCase().includes(focusLower))
    );
    if (focused.length >= 3) pool = [...focused, ...pool.filter(q => !focused.includes(q))];
  }

  pool = shuffle(pool);
  let selected = pool.slice(0, count);

  // AI fill if not enough local questions
  if (selected.length < count) {
    try {
      const aiQuestions = await fetchAIQuestions(role, level, category, selectedDifficulty, focus, count - selected.length);
      selected = [...selected, ...aiQuestions];
    } catch (e) {
      console.warn("AI fetch failed, using local data only:", e);
      if (selected.length === 0) {
        showToast("⚠ No questions found for this combination. Try adjusting filters.");
        generateBtn.disabled = false;
        generateBtn.querySelector("span:last-child").textContent = "Generate Questions";
        generateBtn.querySelector(".btn-icon").textContent = "⚡";
        generateBtn.classList.remove("loading");
        return;
      }
    }
  }

  currentQuestions = selected;

  generateBtn.disabled = false;
  generateBtn.querySelector("span:last-child").textContent = "Generate Questions";
  generateBtn.querySelector(".btn-icon").textContent = "⚡";
  generateBtn.classList.remove("loading");

  renderResults(role, level, category, selectedDifficulty, count);
});

// ─── AI FETCH ─────────────────────────────────────
async function fetchAIQuestions(role, level, category, difficulty, focus, needed) {
  const systemPrompt = `You are an expert technical interviewer. Generate exactly ${needed} interview questions as a JSON array. Each object must have: question (string), category (string), difficulty (string), hint (string). Return ONLY a valid JSON array. No preamble, no markdown, no explanation.`;
  const userPrompt = `Generate ${needed} ${difficulty} ${category} interview questions for a ${level} ${role}.${focus ? ` Focus on: ${focus}.` : ""} Return ONLY a JSON array: [{"question":"...","category":"...","difficulty":"...","hint":"..."}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const text = data.content.map(b => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  return parsed.map((q, i) => ({
    id: 9000 + Date.now() + i,   // unique ID to avoid collisions
    role, level,
    focus: focus || null,
    category: q.category || category,
    difficulty: q.difficulty || difficulty,
    question: q.question,
    hint: q.hint || "",
    ai: true
  }));
}

// ─── RENDER RESULTS ───────────────────────────────
function renderResults(role, level, category, difficulty) {
  resultSection.style.display = "block";
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });

  resultsMeta.textContent = `${currentQuestions.length} questions · ${role} · ${level} · ${difficulty} difficulty`;

  questionsList.innerHTML = "";
  currentQuestions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "q-card";
    card.style.animationDelay = `${idx * 0.05}s`;

    const isSaved = savedQuestions.includes(q.id);
    const diffClass = `diff-${(q.difficulty || "easy").toLowerCase()}`;
    // Use a safe DOM id for the hint element
    const hintId = `hint-${idx}`;

    card.innerHTML = `
      <div class="q-num">${String(idx + 1).padStart(2, "0")}</div>
      <div class="q-body">
        <p class="q-text">${escapeHTML(q.question)}</p>
        <div class="q-tags">
          <span class="q-tag cat">${escapeHTML(q.category)}</span>
          <span class="q-tag ${diffClass}">${escapeHTML(q.difficulty)}</span>
          ${q.ai ? '<span class="q-tag ai-tag">AI</span>' : ""}
        </div>
        <div class="q-answer" id="${hintId}">
          <strong>💡 Hint:</strong> ${escapeHTML(q.hint || "No hint available.")}
        </div>
      </div>
      <div class="q-actions">
        <button class="q-btn ${isSaved ? "saved" : ""}" data-qid="${q.id}" onclick="toggleSaveQuestion(${q.id}, this)">
          ${isSaved ? "★ Saved" : "☆ Save"}
        </button>
        <button class="q-btn" onclick="toggleHint('${hintId}', this)">Show Hint</button>
      </div>
    `;
    questionsList.appendChild(card);
  });
}

// ─── HINT TOGGLE ──────────────────────────────────
window.toggleHint = function (id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const showing = el.classList.toggle("visible");
  btn.textContent = showing ? "Hide Hint" : "Show Hint";
};

// ─── SAVE INDIVIDUAL QUESTION ─────────────────────
window.toggleSaveQuestion = function (id, btn) {
  const idx = savedQuestions.indexOf(id);
  if (idx === -1) {
    savedQuestions.push(id);
    btn.textContent = "★ Saved";
    btn.classList.add("saved");
    showToast("✓ Question saved");
  } else {
    savedQuestions.splice(idx, 1);
    btn.textContent = "☆ Save";
    btn.classList.remove("saved");
    showToast("✗ Question removed");
  }
  try { localStorage.setItem("savedQuestions", JSON.stringify(savedQuestions)); } catch (e) { }
};

// ─── SAVE FULL SET ────────────────────────────────
saveBtn.addEventListener("click", () => {
  if (!currentQuestions.length) {
    showToast("⚠ Generate questions first.");
    return;
  }
  const name = `${roleSelect.value} – ${levelSelect.value}`;
  const set = {
    id: Date.now(),
    name,
    meta: resultsMeta.textContent,
    questions: currentQuestions,   // full objects stored, not just IDs
    savedAt: new Date().toLocaleDateString()
  };
  savedSets.push(set);
  try { localStorage.setItem("savedSets", JSON.stringify(savedSets)); } catch (e) { }
  renderSavedSets();
  showToast("✓ Set saved successfully");
});

// ─── EXPORT CSV ───────────────────────────────────
exportBtn.addEventListener("click", () => {
  if (!currentQuestions.length) {
    showToast("⚠ No questions to export.");
    return;
  }
  downloadCSV(buildCSV(currentQuestions), `interview-questions-${Date.now()}.csv`);
  showToast("⬇ CSV downloaded");
});

function buildCSV(questions) {
  const header = ["#", "Role", "Level", "Category", "Difficulty", "Question", "Hint"];
  const rows = questions.map((q, i) =>
    [
      i + 1,
      csvCell(q.role || ""),
      csvCell(q.level || ""),
      csvCell(q.category || ""),
      csvCell(q.difficulty || ""),
      csvCell(q.question || ""),
      csvCell(q.hint || "")
    ].join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function csvCell(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── RESET ────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  resultSection.style.display = "none";
  currentQuestions = [];
  questionsList.innerHTML = "";
  document.getElementById("config-card").scrollIntoView({ behavior: "smooth" });
});

// ─── RENDER SAVED SETS ────────────────────────────
function renderSavedSets() {
  if (!savedSets.length) {
    savedList.innerHTML = '<p class="empty-state">No saved sets yet. Generate and save a set to see it here.</p>';
    return;
  }
  savedList.innerHTML = savedSets.map(set => `
    <div class="saved-card">
      <div class="saved-info">
        <h4>${escapeHTML(set.name)}</h4>
        <p>${escapeHTML(set.meta)} · Saved ${escapeHTML(set.savedAt)}</p>
      </div>
      <div class="saved-btns">
        <button class="action-btn saved-load" onclick="loadSavedSet(${set.id})">Load</button>
        <button class="action-btn" onclick="exportSavedSet(${set.id})">⬇ CSV</button>
        <button class="action-btn secondary" onclick="deleteSavedSet(${set.id})">✕</button>
      </div>
    </div>
  `).join("");
}

// ─── LOAD SAVED SET ───────────────────────────────
window.loadSavedSet = function (id) {
  const set = savedSets.find(s => s.id === id);
  if (!set) { showToast("⚠ Set not found."); return; }

  currentQuestions = set.questions;
  resultsMeta.textContent = set.meta;
  resultSection.style.display = "block";

  questionsList.innerHTML = "";
  currentQuestions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "q-card";
    card.style.animationDelay = `${idx * 0.05}s`;
    const diffClass = `diff-${(q.difficulty || "easy").toLowerCase()}`;
    const hintId = `hint-saved-${idx}`;

    card.innerHTML = `
      <div class="q-num">${String(idx + 1).padStart(2, "0")}</div>
      <div class="q-body">
        <p class="q-text">${escapeHTML(q.question)}</p>
        <div class="q-tags">
          <span class="q-tag cat">${escapeHTML(q.category)}</span>
          <span class="q-tag ${diffClass}">${escapeHTML(q.difficulty)}</span>
          ${q.ai ? '<span class="q-tag ai-tag">AI</span>' : ""}
        </div>
        <div class="q-answer" id="${hintId}">
          <strong>💡 Hint:</strong> ${escapeHTML(q.hint || "No hint available.")}
        </div>
      </div>
      <div class="q-actions">
        <button class="q-btn" onclick="toggleHint('${hintId}', this)">Show Hint</button>
      </div>
    `;
    questionsList.appendChild(card);
  });

  resultSection.scrollIntoView({ behavior: "smooth" });
  showToast("✓ Set loaded");
};

// ─── EXPORT SAVED SET ─────────────────────────────
window.exportSavedSet = function (id) {
  const set = savedSets.find(s => s.id === id);
  if (!set) { showToast("⚠ Set not found."); return; }
  downloadCSV(buildCSV(set.questions), `${set.name.replace(/[^a-z0-9]/gi, "_")}.csv`);
  showToast("⬇ CSV downloaded");
};

// ─── DELETE SAVED SET ─────────────────────────────
window.deleteSavedSet = function (id) {
  savedSets = savedSets.filter(s => s.id !== id);
  try { localStorage.setItem("savedSets", JSON.stringify(savedSets)); } catch (e) { }
  renderSavedSets();
  showToast("✗ Set deleted");
};

// ─── TOAST ────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// ─── UTILS ────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── INIT ─────────────────────────────────────────
renderSavedSets();