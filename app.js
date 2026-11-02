let tasks = [];
let config = {
    supabaseUrl: "",
    supabasePublishableKey: "",
    tableName: "tasks"
};
let isSupabaseActive = false;
let studentId = "79788";

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
    loadSavedStudentId();
    await checkConfiguration();
    await loadTasks();
});

// Student ID helper
function loadSavedStudentId() {
    const saved = localStorage.getItem('vistula_student_id');
    if (saved) studentId = saved;
    document.getElementById('student-id').textContent = studentId;
}

// Configuration setup
async function checkConfiguration() {
    console.log("checking config.json....");
    try {
        const res = await fetch('config.json', { cache: 'no-cache' });
        if (res.ok) {
            const data = await res.json();
            if (data.supabaseUrl && data.supabasePublishableKey) {
                config = data;
                isSupabaseActive = true;
            }
        }
        console.log("config.json loaded successfully....");
    } catch (e) {
        console.log(`fetching config.json failed because of ${e}....`);
    }

    if (!isSupabaseActive) {
        const stored = localStorage.getItem('vistula_config');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.supabaseUrl && parsed.supabasePublishableKey) {
                    config = parsed;
                    isSupabaseActive = true;
                }
            } catch (e) {}
        }
    }

    // Safely update the mode indicator if it exists on your page
    const modeIndicator = document.getElementById('mode-indicator');
    if (modeIndicator) {
        modeIndicator.textContent = isSupabaseActive ? "Supabase API Active" : "LocalStorage Mode";
        modeIndicator.style.background = isSupabaseActive ? "#d1e7dd" : "#e2e3e5";
        modeIndicator.style.color = isSupabaseActive ? "#0f5132" : "#41464b";
    }
}


// REST API Helper
async function supabaseFetch(endpoint, options = {}) {
    const url = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1${endpoint}`;
    const headers = {
        'apikey': config.supabasePublishableKey,
        'Authorization': `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Error ${response.status}: ${err}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }
    return true;
}

// 1. READ ALL TASKS
async function loadTasks() {
    try {
        if (isSupabaseActive) {
            const data = await supabaseFetch('/tasks?select=*', { method: 'GET' });
            if (data) tasks = data;
        } else {
            const localData = localStorage.getItem('vistula_tasks');
            if (localData) {
                tasks = JSON.parse(localData);
            } else {
                // Default sample tasks
                tasks = [
                    { id: 1, title: "Learn Git", description: "Practice basic Git commands", completed: true },
                    { id: 2, title: "Configure Supabase", description: "Create tasks table with RLS", completed: false }
                ];
                saveLocalTasks();
            }
        }
        renderTasks();
    } catch (err) {
        showMessage(`Error loading tasks: ${err.message}`, "error");
        renderTasks();
    }
}

function saveLocalTasks() {
    localStorage.setItem('vistula_tasks', JSON.stringify(tasks));
}

// Render Task List with required HTML structures & classes
function renderTasks() {
    const container = document.getElementById('task-list');

    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6c757d; font-size: 0.9rem;">No tasks found.</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.completed ? 'is-completed' : ''}" data-id="${task.id}">
            <div class="task-header-row">
                <span class="task-title">${escapeHtml(task.title)}</span>
                <span class="task-status ${task.completed ? 'status-completed' : 'status-pending'}">
                    ${task.completed ? 'Completed' : 'Pending'}
                </span>
            </div>
            
            ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
            
            <div class="task-actions">
                <button class="toggle-task" onclick="toggleTask(${task.id})">
                    ${task.completed ? 'Mark Incomplete' : 'Mark Complete'}
                </button>
                <button class="edit-task" onclick="startEditTask(${task.id})">Edit</button>
                <button class="delete-task" onclick="deleteTask(${task.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

// Form Submit Router (Create vs Edit)
async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id-hidden').value;
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();

    if (!title) {
        showMessage("Title is required.", "error");
        return;
    }

    if (id) {
        await updateTask(id, title, description);
    } else {
        await createTask(title, description);
    }
}

// 2. CREATE TASK
async function createTask(title, description) {
    try {
        if (isSupabaseActive) {
            const result = await supabaseFetch('/tasks', {
                method: 'POST',
                body: JSON.stringify({ title, description, completed: false })
            });
            if (result && result[0]) tasks.unshift(result[0]);
            else await loadTasks();
        } else {
            const newTask = {
                id: Date.now(),
                title,
                description,
                completed: false
            };
            tasks.unshift(newTask);
            saveLocalTasks();
        }

        showMessage("Task created successfully!", "success");
        resetForm();
        renderTasks();
    } catch (err) {
        showMessage(`Failed to create task: ${err.message}`, "error");
    }
}

// 3. EDIT TASK
function startEditTask(id) {
    const task = tasks.find(t => t.id == id);
    if (!task) return;

    document.getElementById('task-id-hidden').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';

    document.getElementById('form-title').textContent = "Edit Task";
    document.getElementById('task-submit').textContent = "Save Changes";
    document.getElementById('cancel-edit-btn').style.display = "block";
}

async function updateTask(id, title, description) {
    try {
        const existing = tasks.find(t => t.id == id);
        const completed = existing ? existing.completed : false;

        if (isSupabaseActive) {
            await supabaseFetch(`/tasks?id=eq.${id}`, {
                method: 'PUT',
                body: JSON.stringify({ id: parseInt(id), title, description, completed })
            });
        }

        const index = tasks.findIndex(t => t.id == id);
        if (index !== -1) {
            tasks[index].title = title;
            tasks[index].description = description;
            if (!isSupabaseActive) saveLocalTasks();
        }

        showMessage("Task updated successfully!", "success");
        resetForm();
        renderTasks();
    } catch (err) {
        showMessage(`Failed to edit task: ${err.message}`, "error");
    }
}

// 4. TOGGLE COMPLETION
async function toggleTask(id) {
    const task = tasks.find(t => t.id == id);
    if (!task) return;

    const newCompleted = !task.completed;

    try {
        if (isSupabaseActive) {
            await supabaseFetch(`/tasks?id=eq.${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ completed: newCompleted })
            });
        }

        task.completed = newCompleted;
        if (!isSupabaseActive) saveLocalTasks();

        showMessage(`Task marked as ${newCompleted ? 'completed' : 'incomplete'}.`, "info");
        renderTasks();
    } catch (err) {
        showMessage(`Failed to toggle task: ${err.message}`, "error");
    }
}

// 5. DELETE TASK
async function deleteTask(id) {
    if (!confirm("Delete this task?")) return;

    try {
        if (isSupabaseActive) {
            await supabaseFetch(`/tasks?id=eq.${id}`, {
                method: 'DELETE'
            });
        }

        tasks = tasks.filter(t => t.id != id);
        if (!isSupabaseActive) saveLocalTasks();

        showMessage("Task deleted.", "success");
        renderTasks();
    } catch (err) {
        showMessage(`Failed to delete task: ${err.message}`, "error");
    }
}

// Reset Form
function resetForm() {
    document.getElementById('task-id-hidden').value = '';
    document.getElementById('task-form').reset();
    document.getElementById('form-title').textContent = "Add Task";
    document.getElementById('task-submit').textContent = "Add Task";
    document.getElementById('cancel-edit-btn').style.display = "none";
}

// Show Messages in id="status-message"
function showMessage(msg, type = "info") {
    const box = document.getElementById('status-message');
    box.className = type;
    box.textContent = msg;
    
    setTimeout(() => {
        box.className = '';
        box.textContent = '';
    }, 4000);
}

// Supabase Settings Helpers
function saveSupabaseConfig() {
    const url = document.getElementById('cfg-url').value.trim();
    const key = document.getElementById('cfg-key').value.trim();

    if (!url || !key) {
        alert("Please enter both Supabase URL and Key.");
        return;
    }

    config = { supabaseUrl: url, supabasePublishableKey: key, tableName: "tasks" };
    localStorage.setItem('vistula_config', JSON.stringify(config));
    isSupabaseActive = true;
    checkConfiguration();
    loadTasks();
    showMessage("Supabase configuration saved!", "success");
}

function clearSupabaseConfig() {
    localStorage.removeItem('vistula_config');
    config = { supabaseUrl: "", supabasePublishableKey: "", tableName: "tasks" };
    isSupabaseActive = false;
    checkConfiguration();
    loadTasks();
    showMessage("Switched to LocalStorage mode.", "info");
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Download Starter Files
function downloadFile(filename, text) {
    const el = document.createElement('a');
    el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    el.setAttribute('download', filename);
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
}

function downloadConfigFile() {
    const data = {
        supabaseUrl: config.supabaseUrl, 
        supabasePublishableKey: config.supabasePublishableKey,
        tableName: "tasks"
    };
    downloadFile('config.json', JSON.stringify(data, null, 2));
}