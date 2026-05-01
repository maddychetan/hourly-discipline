// Utility: Time helpers
const minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

// Normalize Task (Provided by user)
function normalizeTask(task) {
    const hour = Number.isInteger(task.hour) ? task.hour : Math.floor(minutes(task.plannedTime || task.time || "00:00") / 60);
    return {
        id: task.id || (crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${hour}`),
        hour,
        plannedTime: task.plannedTime || task.time || `${String(hour).padStart(2, "0")}:00`,
        title: task.title || "Open block",
        baseSlot: Boolean(task.baseSlot),
        category: task.category || "Routine",
        key: Boolean(task.key),
        notes: task.notes || "",
        completedAt: task.completedAt || null,
        skippedAt: task.skippedAt || null,
        actualCompletionTime: task.actualCompletionTime || null,
        delayMinutes: task.delayMinutes || 0,
        rescheduleCount: task.rescheduleCount || 0,
        rescheduledFrom: task.rescheduledFrom || null,
        suggestedTime: task.suggestedTime || null,
        focusSeconds: task.focusSeconds || 0,
        focusSessions: task.focusSessions || [],
        statusOverride: task.statusOverride || null
    };
}

// State
let tasks = [];
let sleepData = 0;
let currentEditId = null;
let focusTimer = null;
let focusStart = 0;

// DOM Elements
const els = {
    date: document.getElementById('dateLabel'),
    score: document.getElementById('dailyScore'),
    streak: document.getElementById('streakCount'),
    sleep: document.getElementById('sleepHours'),
    timeline: document.getElementById('timeline'),
    insight: document.getElementById('singleInsight'),
    editor: document.getElementById('editor'),
    editorTitle: document.getElementById('editorTitle'),
    editTitle: document.getElementById('editTitle'),
    editTime: document.getElementById('editTime'),
    editCategory: document.getElementById('editCategory'),
    editNotes: document.getElementById('editNotes'),
    editKey: document.getElementById('editKey'),
    editStatusActive: document.getElementById('editStatusActive'),
    editStatusSkipped: document.getElementById('editStatusSkipped'),
    saveEdit: document.getElementById('saveEdit'),
    deleteTask: document.getElementById('deleteTask'),
    closeEditor: document.getElementById('closeEditor'),
    addTask: document.getElementById('addTask'),
    focus: document.getElementById('focusMode'),
    focusTime: document.getElementById('focusTime'),
    focusTitle: document.getElementById('focusTitle'),
    focusMeta: document.getElementById('focusMeta'),
    exitFocus: document.getElementById('exitFocus'),
    completeFocus: document.getElementById('completeFocus')
};

// Init
function init() {
    const stored = localStorage.getItem('discipline_data');
    if (stored) {
        const data = JSON.parse(stored);
        tasks = (data.tasks || []).map(normalizeTask);
        sleepData = data.sleep || 0;
    } else {
        // Default template
        tasks = [
            normalizeTask({ hour: 7, title: "Wake Up & Hydrate", category: "Routine" }),
            normalizeTask({ hour: 8, title: "Deep Work Block 1", category: "Work", key: true }),
            normalizeTask({ hour: 12, title: "Lunch Break", category: "Food" }),
            normalizeTask({ hour: 13, title: "Deep Work Block 2", category: "Work" }),
            normalizeTask({ hour: 17, title: "Gym / Exercise", category: "Gym", key: true }),
            normalizeTask({ hour: 19, title: "Dinner", category: "Food" }),
            normalizeTask({ hour: 21, title: "Review & Plan Tomorrow", category: "Routine" }),
            normalizeTask({ hour: 22, title: "Sleep", category: "Sleep" })
        ];
    }
    
    els.sleep.value = sleepData || '';
    updateDate();
    render();
    setupListeners();
}

function updateDate() {
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    els.date.textContent = new Date().toLocaleDateString(undefined, opts);
}

function save() {
    localStorage.setItem('discipline_data', JSON.stringify({
        tasks,
        sleep: parseFloat(els.sleep.value) || 0,
        lastSave: Date.now()
    }));
    render();
}

function calculateScore() {
    const now = new Date();
    const currentHour = now.getHours();
    let completed = 0;
    let totalRelevant = 0;

    tasks.forEach(t => {
        if (t.hour < currentHour) {
            totalRelevant++;
            if (t.completedAt || t.statusOverride === 'completed') completed++;
        }
    });

    if (totalRelevant === 0) return 100;
    return Math.round((completed / totalRelevant) * 100);
}

function calculateStreak() {
    // Streak = consecutive days with >=1 completed task
    // Since we only have today's data (single-day localStorage), 
    // store streak separately and increment if today has completions
    const stored = localStorage.getItem('discipline_streak');
    const streakData = stored ? JSON.parse(stored) : { count: 0, lastDate: null };
    const today = new Date().toDateString();
    const completedToday = tasks.some(t => t.completedAt);
    
    if (completedToday && streakData.lastDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const wasYesterday = streakData.lastDate === yesterday.toDateString();
        streakData.count = wasYesterday ? streakData.count + 1 : 1;
        streakData.lastDate = today;
        localStorage.setItem('discipline_streak', JSON.stringify(streakData));
    }
    return streakData.count;
}


    // Score
    els.score.textContent = `${calculateScore()}%`;
    
    // Streak
    els.streak.textContent = calculateStreak();
    
    // Sleep
    sleepData = parseFloat(els.sleep.value) || 0;
    
    // Timeline
    els.timeline.innerHTML = '';
    // Sort tasks by hour
    const sorted = [...tasks].sort((a,b) => a.hour - b.hour);
    
    sorted.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.completedAt ? 'completed' : ''} ${task.skippedAt ? 'skipped' : ''}`;
        card.onclick = () => openEditor(task.id);
        
        const isDone = !!task.completedAt;
        const isSkipped = !!task.skippedAt;
        
        card.innerHTML = `
            <div class="task-time">${task.plannedTime}</div>
            <div class="task-content">
                <div class="task-title">${task.title} ${task.key ? '🔑' : ''}</div>
                <div class="task-meta">${task.category} ${isDone ? '• Done' : ''} ${isSkipped ? '• Skipped' : ''}</div>
            </div>
            <button class="icon-button small focus-btn" data-id="${task.id}" style="width:30px;height:30px;font-size:0.8rem;margin-right:5px;" aria-label="Focus">▶</button>
            <div class="task-check"></div>
        `;
        els.timeline.appendChild(card);
    });

    // Insight
    const score = calculateScore();
    if (score === 100 && tasks.some(t => t.hour < new Date().getHours())) {
        els.insight.hidden = false;
        els.insight.textContent = "🔥 Perfect discipline so far! Keep it up.";
    } else if (score < 50) {
        els.insight.hidden = false;
        els.insight.textContent = "⚠️ Getting off track. Reset with the next task.";
    } else {
        els.insight.hidden = true;
    }
}

// Editor Logic
function openEditor(id) {
    currentEditId = id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    els.editorTitle.textContent = "Edit Task";
    els.editTitle.value = task.title;
    els.editTime.value = task.plannedTime;
    els.editCategory.value = task.category;
    els.editNotes.value = task.notes;
    els.editKey.checked = task.key;
    els.editStatusActive.checked = !task.skippedAt && !task.completedAt;
    els.editStatusSkipped.checked = !!task.skippedAt;
    
    els.editor.hidden = false;
}

function closeEditor() {
    els.editor.hidden = true;
    currentEditId = null;
}

function saveTask() {
    if (!currentEditId) return;
    const idx = tasks.findIndex(t => t.id === currentEditId);
    if (idx === -1) return;

    const task = tasks[idx];
    task.title = els.editTitle.value;
    task.plannedTime = els.editTime.value;
    task.hour = Math.floor(minutes(els.editTime.value) / 60);
    task.category = els.editCategory.value;
    task.notes = els.editNotes.value;
    task.key = els.editKey.checked;
    
    if (els.editStatusSkipped.checked) {
        task.skippedAt = new Date().toISOString();
        task.completedAt = null;
    } else {
        task.skippedAt = null;
        // If it was skipped before and now active, clear skip
        if (!task.completedAt) task.completedAt = null; 
    }

    save();
    closeEditor();
}

function deleteTask() {
    if (!currentEditId) return;
    if(confirm("Delete this task?")) {
        tasks = tasks.filter(t => t.id !== currentEditId);
        save();
        closeEditor();
    }
}

// Add New Task
els.addTask.onclick = () => {
    const newTask = normalizeTask({
        hour: new Date().getHours(),
        title: "New Task",
        category: "Routine"
    });
    tasks.push(newTask);
    save();
    openEditor(newTask.id);
};

// Focus Mode
function startFocus(task) {
    els.focusTitle.textContent = task.title;
    els.focusMeta.textContent = `${task.category} • ${task.plannedTime}`;
    els.focusTime.textContent = "00:00";
    els.focus.hidden = false;
    
    focusStart = Date.now();
    focusTimer = setInterval(() => {
        const diff = Math.floor((Date.now() - focusStart) / 1000);
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        els.focusTime.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function stopFocus(complete) {
    clearInterval(focusTimer);
    els.focus.hidden = true;
    if (complete && currentEditId) {
        const idx = tasks.findIndex(t => t.id === currentEditId);
        if (idx !== -1) {
            tasks[idx].completedAt = new Date().toISOString();
            tasks[idx].focusSeconds += Math.floor((Date.now() - focusStart)/1000);
            save();
        }
    }
    currentEditId = null; // Reset context
}

// Listeners
function setupListeners() {
    els.closeEditor.onclick = closeEditor;
    els.saveEdit.onclick = saveTask;
    els.deleteTask.onclick = deleteTask;
    els.exitFocus.onclick = () => stopFocus(false);
    els.completeFocus.onclick = () => stopFocus(true);
    
    els.sleep.addEventListener('change', save);
    
    // Event delegation for focus buttons on timeline
    els.timeline.addEventListener('click', (e) => {
        const btn = e.target.closest('.focus-btn');
        if (btn) {
            e.stopPropagation();
            const id = btn.dataset.id;
            const task = tasks.find(t => t.id === id);
            if (task) {
                currentEditId = id;
                startFocus(task);
            }
        }
    });
}

// Start
init();
