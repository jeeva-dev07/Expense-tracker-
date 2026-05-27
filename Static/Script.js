const API_URL = "http://127.0.0.1:5000";

// === COMMON FETCH WRAPPER WITH SESSION SECURITY ===
async function authorizedFetch(url, options = {}) {
    options.credentials = 'include';
    if (!options.headers) {
        options.headers = {};
    }
    if (!(options.body instanceof FormData) && typeof options.body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            const currentPath = window.location.pathname;
            // Dashboard illana Expenses page-la irukum bodhu session expire aana mattum login-ku thallum
            if (!currentPath.endsWith('login.html') && !currentPath.endsWith('register.html') && currentPath !== '/') {
                window.location.href = 'login.html';
            }
        }
        return response;
    } catch (error) {
        console.error("Fetch Error:", error);
        throw error;
    }
}

// === USER AUTHENTICATION CONTROLLERS ===

// 1. Login Form Handling
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('username') || document.getElementById('loginUsername');
        const passwordInput = document.getElementById('password') || document.getElementById('loginPassword');
        
        if (!usernameInput || !passwordInput) {
            alert("HTML Control ID Mismatch on Login Form!");
            return;
        }

        try {
            const res = await authorizedFetch(`${API_URL}/login`, {
                method: 'POST',
                body: { username: usernameInput.value.trim(), password: passwordInput.value }
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = 'dashboard.html';
            } else {
                alert(data.error || 'Login failed');
            }
        } catch (err) {
            alert('Server connectivity error.');
        }
    });
}

// 2. Register Form Handling
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regConfirmPassword').value;

        if (password !== confirm) {
            alert("Passwords do not match!");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            
            const data = await res.json();
            if (res.ok) {
                alert('Registration successful! Please log in.');
                window.location.href = 'login.html';
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (err) {
            alert('Server connectivity error. Ensure backend app.py is running.');
        }
    });
}

// 3. Logout Action
async function handleLogout() {
    try {
        await authorizedFetch(`${API_URL}/logout`);
        window.location.href = 'login.html';
    } catch (err) {
        window.location.href = 'login.html';
    }
}

// === EXPENSE TRACKER CONTROLLERS ===

let memoryExpensesCollection = [];

// 1. Load Dashboard View (analytics and summary cards)
async function loadDashboardView() {
    try {
        const sessionCheck = await authorizedFetch(`${API_URL}/check-session`);
        if (sessionCheck.ok) {
            const sData = await sessionCheck.json();
            const welcomeMsg = document.getElementById('welcomeMsg');
            if (welcomeMsg) welcomeMsg.innerText = `Welcome, ${sData.username}`;
        }

        const res = await authorizedFetch(`${API_URL}/expenses/summary`);
        if (!res.ok) return;
        const data = await res.json();

        if (document.getElementById('statCount')) document.getElementById('statCount').innerText = data.total_count;
        if (document.getElementById('statSum')) document.getElementById('statSum').innerText = `$${data.total_spent.toFixed(2)}`;
        if (document.getElementById('statMax')) document.getElementById('statMax').innerText = `$${data.highest_expense.toFixed(2)}`;
        if (document.getElementById('statCats')) document.getElementById('statCats').innerText = data.categories_used;

        const targetContainer = document.getElementById('categoryBars');
        if (targetContainer) {
            targetContainer.innerHTML = '';
            if (data.category_breakdown.length === 0) {
                targetContainer.innerHTML = '<p>No data available</p>';
            }
            data.category_breakdown.forEach(item => {
                const percent = data.total_spent > 0 ? (item.amount / data.total_spent) * 100 : 0;
                const row = document.createElement('div');
                row.className = 'progress-wrapper';
                row.innerHTML = `
                    <div class="progress-label">
                        <span>${item.category}</span>
                        <strong>$${item.amount.toFixed(2)} (${percent.toFixed(1)}%)</strong>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percent}%"></div>
                    </div>
                `;
                targetContainer.appendChild(row);
            });
        }

        const body = document.getElementById('recentTableBody');
        if (body) {
            body.innerHTML = '';
            data.recent_expenses.forEach(x => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${x.title}</td><td>${x.category}</td><td>$${parseFloat(x.amount).toFixed(2)}</td><td>${x.date}</td>`;
                body.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

// 2. Load Ledger View (The master entries list)
async function loadLedgerView() {
    try {
        const sessionCheck = await authorizedFetch(`${API_URL}/check-session`);
        if (sessionCheck.ok) {
            const sData = await sessionCheck.json();
            const welcomeMsg = document.getElementById('welcomeMsg');
            if (welcomeMsg) welcomeMsg.innerText = `Welcome, ${sData.username}`;
        }

        const res = await authorizedFetch(`${API_URL}/expenses`);
        if (!res.ok) return;
        memoryExpensesCollection = await res.json();
        renderLedgerTable(memoryExpensesCollection);
    } catch (err) {
        console.error(err);
    }
}

// 3. Render Table HTML Dynamic Creation
function renderLedgerTable(itemsList) {
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (itemsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>`;
        return;
    }

    itemsList.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.title}</td>
            <td>${item.category}</td>
            <td>$${parseFloat(item.amount).toFixed(2)}</td>
            <td>${item.date}</td>
            <td>${item.note || '-'}</td>
            <td class="actions">
                <button class="edit-btn" onclick="initiateEditRow(${item.id})">Edit</button>
                <button class="del-btn" onclick="triggerDeleteRow(${item.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 4. Log/Update Expense Form Submission Listener
const expenseForm = document.getElementById('expenseForm');
if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const titleEl = document.getElementById('expTitle') || document.getElementById('title');
        const amountEl = document.getElementById('expAmount') || document.getElementById('amount');
        const catEl = document.getElementById('expCategory') || document.getElementById('category');
        const dateEl = document.getElementById('expDate') || document.getElementById('date');
        const noteEl = document.getElementById('expNote') || document.getElementById('note');
        const idEl = document.getElementById('editExpenseId');

        const id = idEl ? idEl.value : '';
        const payload = {
            title: titleEl.value.trim(),
            amount: parseFloat(amountEl.value),
            category: catEl.value,
            date: dateEl.value,
            note: noteEl ? noteEl.value.trim() : ''
        };

        const targetEndpoint = id ? `${API_URL}/expenses/${id}` : `${API_URL}/expenses`;
        const restMethod = id ? 'PUT' : 'POST';

        try {
            const res = await authorizedFetch(targetEndpoint, {
                method: restMethod,
                body: payload
            });

            if (res.ok) {
                resetExpenseForm();
                loadLedgerView(); 
            } else {
                const data = await res.json();
                alert(data.error || 'Save failed');
            }
        } catch (err) {
            alert('Error updating database execution loop.');
        }
    });
}

// 5. Form Actions: Edit, Reset and Delete Row Triggers
function initiateEditRow(id) {
    const target = memoryExpensesCollection.find(x => x.id === id);
    if (!target) return;

    const titleEl = document.getElementById('expTitle') || document.getElementById('title');
    const amountEl = document.getElementById('expAmount') || document.getElementById('amount');
    const catEl = document.getElementById('expCategory') || document.getElementById('category');
    const dateEl = document.getElementById('expDate') || document.getElementById('date');
    const noteEl = document.getElementById('expNote') || document.getElementById('note');
    const idEl = document.getElementById('editExpenseId');

    if (document.getElementById('formTitle')) document.getElementById('formTitle').innerText = "Modify Ledger Entry";
    if (idEl) idEl.value = target.id;
    if (titleEl) titleEl.value = target.title;
    if (amountEl) amountEl.value = target.amount;
    if (catEl) catEl.value = target.category;
    if (dateEl) dateEl.value = target.date;
    if (noteEl) noteEl.value = target.note || '';

    if (document.getElementById('saveBtn')) document.getElementById('saveBtn').innerText = "Save Changes";
    if (document.getElementById('cancelEditBtn')) document.getElementById('cancelEditBtn').style.display = "block";
}

function resetExpenseForm() {
    if (document.getElementById('formTitle')) document.getElementById('formTitle').innerText = "Log New Entry";
    if (document.getElementById('editExpenseId')) document.getElementById('editExpenseId').value = '';
    if (expenseForm) expenseForm.reset();
    if (document.getElementById('saveBtn')) document.getElementById('saveBtn').innerText = "Submit Expense";
    if (document.getElementById('cancelEditBtn')) document.getElementById('cancelEditBtn').style.display = "none";
}

async function triggerDeleteRow(id) {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
        const res = await authorizedFetch(`${API_URL}/expenses/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadLedgerView(); 
        } else {
            alert("Delete action failed on database level.");
        }
    } catch (err) {
        console.error(err);
    }
}

// === FILTER CONTROLLERS ===
async function applyFilters() {
    const cat = document.getElementById('filterCategory').value;
    const fromDate = document.getElementById('filterFrom').value;
    const toDate = document.getElementById('filterTo').value;

    const searchParams = new URLSearchParams();
    if (cat) searchParams.append('category', cat);
    if (fromDate) searchParams.append('from', fromDate);
    if (toDate) searchParams.append('to', toDate);

    const res = await authorizedFetch(`${API_URL}/expenses/filter?${searchParams.toString()}`);
    if (res.ok) {
        const filteredData = await res.json();
        renderLedgerTable(filteredData);
    }
}

function clearFilters() {
    if (document.getElementById('filterCategory')) document.getElementById('filterCategory').value = '';
    if (document.getElementById('filterFrom')) document.getElementById('filterFrom').value = '';
    if (document.getElementById('filterTo')) document.getElementById('filterTo').value = '';
    renderLedgerTable(memoryExpensesCollection);
}

// === LIVE CLIENT-SIDE DASHBOARD SEARCH ===
function liveDashboardSearch() {
    const input = document.getElementById('dbSearchInput');
    if (!input) return;
    
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('recentTableBody');
    if (!tbody) return;
    
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const titleCell = rows[i].getElementsByTagName('td')[0];
        if (titleCell) {
            const txtValue = titleCell.textContent || titleCell.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                rows[i].style.display = "";
            } else {
                rows[i].style.display = "none";
            }
        }
    }
}

// === DYNAMIC PAGE INITIALIZER BOOTSTRAPPER ===
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    if (currentPath.endsWith('expenses.html') || currentPath.endsWith('expenses')) {
        loadLedgerView();
    } else if (currentPath.endsWith('dashboard.html') || currentPath.endsWith('dashboard')) {
        loadDashboardView();
    }
});
