document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const loginForm = document.getElementById("login-form");
  const authPanel = document.getElementById("auth-panel");
  const toggleLoginButton = document.getElementById("toggle-login");
  const logoutButton = document.getElementById("logout-button");
  const sessionLabel = document.getElementById("session-label");

  let authToken = localStorage.getItem("authToken");
  let currentUser = null;

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function getAuthHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function canManageParticipants() {
    return currentUser && ["teacher", "admin"].includes(currentUser.role);
  }

  function updateAuthUi() {
    if (currentUser) {
      sessionLabel.textContent = `${currentUser.name} signed in as ${currentUser.role}`;
      toggleLoginButton.classList.add("hidden");
      logoutButton.classList.remove("hidden");
      authPanel.classList.add("hidden");
      return;
    }

    sessionLabel.textContent = "Browsing as guest";
    toggleLoginButton.classList.remove("hidden");
    logoutButton.classList.add("hidden");
  }

  async function fetchSession() {
    if (!authToken) {
      currentUser = null;
      updateAuthUi();
      return;
    }

    try {
      const response = await fetch("/auth/session", {
        headers: getAuthHeaders(),
      });
      const result = await response.json();

      if (result.authenticated) {
        currentUser = result.user;
      } else {
        authToken = null;
        currentUser = null;
        localStorage.removeItem("authToken");
      }
    } catch (error) {
      authToken = null;
      currentUser = null;
      localStorage.removeItem("authToken");
      console.error("Error fetching session:", error);
    }

    updateAuthUi();
  }

  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      activitiesList.innerHTML = "";
      activitySelect.innerHTML =
        '<option value="">-- Select an activity --</option>';

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;

        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map((email) => {
                    const manageButton = canManageParticipants()
                      ? `<button class="delete-btn" data-activity="${name}" data-email="${email}" title="Remove participant">Remove</button>`
                      : "";

                    return `<li><span class="participant-email">${email}</span>${manageButton}</li>`;
                  })
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        const staffNotice = canManageParticipants()
          ? '<p class="staff-note"><strong>Staff tools:</strong> you can remove a student from this roster.</p>'
          : "";

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          ${staffNotice}
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    if (!canManageParticipants()) {
      showMessage("Only teachers and admins can remove participants.", "error");
      return;
    }

    if (!window.confirm(`Remove ${email} from ${activity}?`)) {
      return;
    }

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Login failed.", "error");
        return;
      }

      authToken = result.token;
      localStorage.setItem("authToken", authToken);
      loginForm.reset();
      await fetchSession();
      await fetchActivities();
      showMessage(result.message, "success");
    } catch (error) {
      showMessage("Failed to sign in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  toggleLoginButton.addEventListener("click", () => {
    authPanel.classList.toggle("hidden");
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }

    authToken = null;
    currentUser = null;
    localStorage.removeItem("authToken");
    updateAuthUi();
    await fetchActivities();
    showMessage("Logged out.", "success");
  });

  async function init() {
    await fetchSession();
    await fetchActivities();
  }

  init();
});
