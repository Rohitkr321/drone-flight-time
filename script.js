document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    setupValidation();

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            await login(); 
        });
    }

    const fetchButton = document.getElementById("fetchButton");
    if (fetchButton) {
        fetchButton.addEventListener("click", fetchFlightTime);
    }
});

function checkAuth() {
    const token = localStorage.getItem("token");

    if (window.location.pathname.includes("dashboard.html")) {
        if (!token) {
            window.location.href = "index.html";
        }
    } else if (window.location.pathname.includes("index.html")) {
        if (token) {
            window.location.href = "dashboard.html";
        }
    }
}

function setupValidation() {
    const droneCodesInput = document.getElementById("droneCodes");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const fetchButton = document.getElementById("fetchButton");

    function validateForm() {
        const droneCodes = droneCodesInput.value.trim();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchButton.disabled = !(droneCodes && startDate && endDate);
    }

    if (droneCodesInput && startDateInput && endDateInput && fetchButton) {
        droneCodesInput.addEventListener("input", validateForm);
        startDateInput.addEventListener("input", validateForm);
        endDateInput.addEventListener("input", validateForm);
        validateForm(); // Initial check
    }
}

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("errorMessage");
    const loginButton = document.querySelector("button");

    // Disable the button and change its style
    loginButton.disabled = true;
    loginButton.style.backgroundColor = "#ccc";
    loginButton.textContent = "Processing...";

    try {
        const response = await fetch("https://d3b7rh19ug.execute-api.ap-south-1.amazonaws.com/prod/nucleus/User/v3/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: "ga-entrepreneur-web",
                username,
                password,
                force_login: true
            })
        });

        if (!response.ok) {
            throw new Error(`Login failed: ${response.status}`);
        }

        const data = await response.json();
        localStorage.setItem("token", data.auth_data.access_token);
        window.location.href = "dashboard.html";
    } catch (error) {
        errorMessage.textContent = "Login failed. Please check your credentials.";
        console.error("Error:", error);
    } finally {
        // Re-enable button after processing
        loginButton.disabled = false;
        loginButton.style.backgroundColor = "#007bff";
        loginButton.textContent = "Login";
    }
}


async function fetchFlightTime() {
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Unauthorized! Please login first.");
        window.location.href = "index.html";
        return;
    }

    const droneCodes = document.getElementById("droneCodes").value.split(',')
        .map(dc => `'${dc.trim()}'`).join(',');
    const startDate = document.getElementById("startDate").value + " 00:00:00";
    const endDate = document.getElementById("endDate").value + " 23:59:59";
    const fetchButton = document.getElementById("fetchButton");
    const tbody = document.querySelector("#resultTable tbody");

    fetchButton.disabled = true;
    fetchButton.textContent = "Fetching...";
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
        const query = `SELECT d.drone_code, 
        SEC_TO_TIME(COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.mission_summary, '$.consolidated_mission_summary.time_elapsed.value')) 
        COLLATE utf8mb4_unicode_ci AS UNSIGNED)), 0)) AS total_flight_time_hms 
        FROM missions m 
        JOIN JSON_TABLE(m.mission_summary, '$.consolidated_mission_summary.drones_code[*]' 
        COLUMNS (drone_code VARCHAR(20) PATH '$')) jt 
        ON jt.drone_code IS NOT NULL 
        JOIN drones d 
        ON jt.drone_code COLLATE utf8mb4_unicode_ci = d.drone_code COLLATE utf8mb4_unicode_ci 
        WHERE d.drone_code COLLATE utf8mb4_unicode_ci IN (${droneCodes}) 
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(m.mission_summary, '$.consolidated_mission_summary.mission_start_datetime.value')) 
        AS DATETIME) BETWEEN '${startDate}' AND '${endDate}' 
        GROUP BY d.drone_code;`;

        const url = new URL('https://prodcastor.generalaeronautics.com/Drone/v4/flight-time/data');
        url.searchParams.append('query', query);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            logout(); // Call logout function on unauthorized response
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data = await response.json();
        displayResults(data);
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="2">Error fetching data</td></tr>';
        console.error("Error:", error);
    } finally {
        fetchButton.disabled = false;
        fetchButton.textContent = "Get Flight Time Data";
    }
}

function logout() {
    localStorage.removeItem("token"); // Remove token
    window.location.href = "index.html"; // Redirect to login
}

function displayResults(data) {
    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2">No data found</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.drone_code}</td><td>${row.total_flight_time_hms}</td>`;
        tbody.appendChild(tr);
    });
}
