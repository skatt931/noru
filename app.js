(function () {
  const config = window.NORU_CONFIG || {};
  const pageMode = document.body.dataset.page || "public";
  const hasSupabaseConfig =
    typeof config.supabaseUrl === "string" &&
    config.supabaseUrl.startsWith("http") &&
    typeof config.supabaseAnonKey === "string" &&
    config.supabaseAnonKey.length > 20;

  const refs = {
    connectionStatus: document.getElementById("connection-status"),
    approvedCount: document.getElementById("approved-count"),
    pendingCount: document.getElementById("pending-count"),
    venuesList: document.getElementById("venues-list"),
    venueCardTemplate: document.getElementById("venue-card-template"),
    reviewCardTemplate: document.getElementById("review-card-template"),
    searchInput: document.getElementById("search-input"),
    form: document.getElementById("venue-form"),
    submitButton: document.getElementById("submit-button"),
    formMessage: document.getElementById("form-message"),
    nameInput: document.getElementById("name-input"),
    mapsInput: document.getElementById("maps-input"),
    commentInput: document.getElementById("comment-input"),
    ownersInput: document.getElementById("owners-input"),
    loginForm: document.getElementById("login-form"),
    loginMessage: document.getElementById("login-message"),
    reviewerEmail: document.getElementById("reviewer-email"),
    reviewerPassword: document.getElementById("reviewer-password"),
    reviewerSession: document.getElementById("reviewer-session"),
    reviewerEmailLabel: document.getElementById("reviewer-email-label"),
    reviewerRoleLabel: document.getElementById("reviewer-role-label"),
    signupButton: document.getElementById("signup-button"),
    claimReviewerButton: document.getElementById("claim-reviewer-button"),
    logoutButton: document.getElementById("logout-button"),
    refreshReviewButton: document.getElementById("refresh-review-button"),
    reviewList: document.getElementById("review-list"),
    viewButtons: document.querySelectorAll("[data-view-target]"),
    views: document.querySelectorAll(".view"),
  };

  const state = {
    approvedVenues: [],
    filteredVenues: [],
    pendingVenues: [],
    session: null,
    isReviewer: false,
  };

  let supabase = null;
  const REQUEST_TIMEOUT_MS = 12000;

  if (hasSupabaseConfig && window.supabase) {
    supabase = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
  }

  initialize();

  async function initialize() {
    bindViewSwitcher();
    bindSearch();
    bindVenueForm();
    bindReviewerActions();

    if (!supabase) {
      if (refs.connectionStatus) {
        refs.connectionStatus.textContent =
          "Додайте `supabaseUrl` і `supabaseAnonKey` у config.js, щоб увімкнути Noru.";
        refs.connectionStatus.classList.add("is-error");
      }
      if (refs.submitButton) {
        refs.submitButton.disabled = true;
      }
      if (refs.refreshReviewButton) {
        refs.refreshReviewButton.disabled = true;
      }
      if (refs.venuesList) {
        renderEmptyState(
          refs.venuesList,
          "Поки що немає підключення до Supabase."
        );
      }
      if (refs.reviewList) {
        renderEmptyState(
          refs.reviewList,
          "Рев’ю-панель стане активною після заповнення config.js."
        );
      }
      return;
    }

    if (refs.connectionStatus) {
      refs.connectionStatus.textContent = "Підключено до Supabase.";
      refs.connectionStatus.classList.add("is-success");
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      void handleSessionChange(session);
    });

    const { data } = await supabase.auth.getSession();
    await handleSessionChange(data.session);

    await Promise.all([
      refs.venuesList ? loadApprovedVenues() : Promise.resolve(),
      pageMode === "admin" && state.isReviewer ? loadPendingVenues() : Promise.resolve(),
    ]);
  }

  function bindViewSwitcher() {
    if (!refs.viewButtons.length || refs.viewButtons.length < 2) {
      return;
    }

    refs.viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.viewTarget;
        refs.viewButtons.forEach((item) => item.classList.remove("is-active"));
        refs.views.forEach((view) => view.classList.remove("is-visible"));
        button.classList.add("is-active");
        document.getElementById(targetId).classList.add("is-visible");
      });
    });
  }

  function bindSearch() {
    if (!refs.searchInput) {
      return;
    }

    refs.searchInput.addEventListener("input", () => {
      applySearchFilter();
      renderApprovedVenues();
    });
  }

  function bindVenueForm() {
    if (!refs.form) {
      return;
    }

    refs.form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!supabase) {
        return;
      }

      setMessage(refs.formMessage, "Надсилання...", "");
      refs.submitButton.disabled = true;

      try {
        const payload = {
          name: refs.nameInput.value.trim(),
          google_maps_url: refs.mapsInput.value.trim(),
          comment: refs.commentInput.value.trim(),
          owners: refs.ownersInput.value.trim() || null,
        };

        const { error } = await withTimeout(
          supabase.from("venues").insert(payload),
          REQUEST_TIMEOUT_MS,
          "Час очікування вичерпано під час надсилання закладу."
        );

        if (error) {
          setMessage(refs.formMessage, error.message, "is-error");
          return;
        }

        refs.form.reset();
        setMessage(
          refs.formMessage,
          "Заклад відправлено на рев’ю. Після апруву він з’явиться в основному списку.",
          "is-success"
        );
        await updatePendingCount();
      } catch (error) {
        setMessage(refs.formMessage, getErrorMessage(error), "is-error");
      } finally {
        refs.submitButton.disabled = false;
      }
    });
  }

  function bindReviewerActions() {
    if (!refs.loginForm || !refs.loginMessage) {
      return;
    }

    refs.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!supabase) {
        return;
      }

      setMessage(refs.loginMessage, "Вхід...", "");
      try {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: refs.reviewerEmail.value.trim(),
            password: refs.reviewerPassword.value,
          }),
          REQUEST_TIMEOUT_MS,
          "Час очікування вичерпано під час входу."
        );

        if (error) {
          setMessage(refs.loginMessage, error.message, "is-error");
          return;
        }

        refs.loginForm.reset();
        setMessage(refs.loginMessage, "Успішний вхід.", "is-success");
      } catch (error) {
        setMessage(refs.loginMessage, getErrorMessage(error), "is-error");
      }
    });

    refs.logoutButton.addEventListener("click", async () => {
      if (!supabase) {
        return;
      }

      refs.logoutButton.disabled = true;
      const { error } = await supabase.auth.signOut();
      refs.logoutButton.disabled = false;

      if (error) {
        setMessage(refs.loginMessage, error.message, "is-error");
        return;
      }

      setMessage(refs.loginMessage, "Ви вийшли з акаунта рев’юера.", "");
    });

    refs.signupButton.addEventListener("click", async () => {
      if (!supabase) {
        return;
      }

      setMessage(refs.loginMessage, "Створення акаунта...", "");
      refs.signupButton.disabled = true;

      const { data, error } = await supabase.auth.signUp({
        email: refs.reviewerEmail.value.trim(),
        password: refs.reviewerPassword.value,
      });

      refs.signupButton.disabled = false;

      if (error) {
        setMessage(refs.loginMessage, error.message, "is-error");
        return;
      }

      if (data.session) {
        setMessage(
          refs.loginMessage,
          "Акаунт створено і ви вже залогінені. Тепер можна забрати роль першого рев’юера.",
          "is-success"
        );
        return;
      }

      setMessage(
        refs.loginMessage,
        "Акаунт створено. Якщо в проєкті ввімкнене email підтвердження, перевірте пошту й тоді увійдіть.",
        "is-success"
      );
    });

    refs.refreshReviewButton.addEventListener("click", async () => {
      if (!state.isReviewer) {
        setMessage(
          refs.loginMessage,
          "Спершу увійдіть рев’юером, щоб бачити pending-записи.",
          "is-error"
        );
        return;
      }

      refs.refreshReviewButton.disabled = true;
      await loadPendingVenues();
      refs.refreshReviewButton.disabled = false;
    });

    refs.claimReviewerButton.addEventListener("click", async () => {
      if (!supabase || !state.session) {
        return;
      }

      refs.claimReviewerButton.disabled = true;

      const { error } = await supabase.from("reviewers").insert({
        user_id: state.session.user.id,
      });

      refs.claimReviewerButton.disabled = false;

      if (error) {
        setMessage(
          refs.loginMessage,
          "Перший рев’юер уже призначений. Якщо це не ви, потрібно додати ваш user id у таблицю reviewers окремо.",
          "is-error"
        );
        await syncReviewerState();
        updateReviewerUi();
        return;
      }

      await syncReviewerState();
      updateReviewerUi();
      await loadPendingVenues();
      setMessage(
        refs.loginMessage,
        "Роль першого рев’юера успішно активована.",
        "is-success"
      );
    });

    refs.reviewList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || !state.isReviewer) {
        return;
      }

      const venueId = Number(button.dataset.id);
      const action = button.dataset.action;
      const nextStatus = action === "approve" ? "approved" : "rejected";

      button.disabled = true;

      const updatePayload = {
        status: nextStatus,
        approved_at: action === "approve" ? new Date().toISOString() : null,
        approved_by:
          action === "approve" && state.session ? state.session.user.id : null,
      };

      const { error } = await supabase
        .from("venues")
        .update(updatePayload)
        .eq("id", venueId);

      if (error) {
        button.disabled = false;
        setMessage(refs.loginMessage, error.message, "is-error");
        return;
      }

      await Promise.all([loadPendingVenues(), loadApprovedVenues()]);
      setMessage(
        refs.loginMessage,
        action === "approve" ? "Заклад апрувнуто." : "Заклад відхилено.",
        "is-success"
      );
    });
  }

  async function syncReviewerState() {
    if (!state.session) {
      state.isReviewer = false;
      return;
    }

    const { data, error } = await supabase
      .from("reviewers")
      .select("user_id")
      .eq("user_id", state.session.user.id)
      .maybeSingle();

    state.isReviewer = !error && Boolean(data);
  }

  async function handleSessionChange(session) {
    state.session = session;

    try {
      await syncReviewerState();
      if (pageMode === "admin") {
        updateReviewerUi();

        if (state.isReviewer) {
          await loadPendingVenues();
        } else {
          state.pendingVenues = [];
          renderPendingVenues();
        }
      }
    } catch (error) {
      if (refs.loginMessage) {
        setMessage(refs.loginMessage, getErrorMessage(error), "is-error");
      }
    }
  }

  function updateReviewerUi() {
    if (!refs.loginForm || !refs.reviewerSession) {
      return;
    }

    const hasSession = Boolean(state.session);

    refs.loginForm.hidden = hasSession;
    refs.logoutButton.hidden = !hasSession;
    refs.reviewerSession.hidden = !hasSession;

    if (!hasSession) {
      refs.reviewerEmailLabel.textContent = "";
      refs.reviewerRoleLabel.textContent =
        "Увійдіть через Supabase Auth, якщо у вас є права рев’юера.";
      renderPendingVenues();
      return;
    }

    refs.reviewerEmailLabel.textContent = state.session.user.email || "Без email";
    refs.reviewerRoleLabel.textContent = state.isReviewer
      ? "Роль: reviewer"
      : "Користувач залогінений, але ще не має reviewer-доступу.";
    refs.claimReviewerButton.hidden = state.isReviewer;
    renderPendingVenues();
  }

  async function loadApprovedVenues() {
    if (!refs.venuesList) {
      return;
    }

    const { data, error } = await supabase
      .from("venues")
      .select("id, name, google_maps_url, comment, owners, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      if (refs.connectionStatus) {
        refs.connectionStatus.textContent = error.message;
        refs.connectionStatus.classList.add("is-error");
      }
      return;
    }

    state.approvedVenues = data || [];
    applySearchFilter();
    if (refs.approvedCount) {
      refs.approvedCount.textContent = `${state.approvedVenues.length} апрувнутих`;
    }
    renderApprovedVenues();
  }

  async function loadPendingVenues() {
    if (!refs.reviewList) {
      return;
    }

    if (!state.isReviewer) {
      state.pendingVenues = [];
      renderPendingVenues();
      await updatePendingCount();
      return;
    }

    const { data, error } = await supabase
      .from("venues")
      .select("id, name, google_maps_url, comment, owners, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(refs.loginMessage, error.message, "is-error");
      return;
    }

    state.pendingVenues = data || [];
    renderPendingVenues();
    await updatePendingCount();
  }

  async function updatePendingCount() {
    if (!refs.pendingCount) {
      return;
    }

    if (!state.isReviewer) {
      refs.pendingCount.textContent = "pending приховано";
      return;
    }

    const { count } = await supabase
      .from("venues")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    refs.pendingCount.textContent = `${count || 0} очікує рев’ю`;
  }

  function applySearchFilter() {
    const query = refs.searchInput ? refs.searchInput.value.trim().toLowerCase() : "";
    state.filteredVenues = state.approvedVenues.filter((venue) => {
      const haystack = `${venue.name} ${venue.comment} ${venue.owners || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderApprovedVenues() {
    if (!refs.venuesList || !refs.venueCardTemplate) {
      return;
    }

    if (!state.filteredVenues.length) {
      const message = state.approvedVenues.length
        ? "За цим пошуком нічого не знайдено."
        : "Поки що ще немає жодного апрувнутого закладу.";
      renderEmptyState(refs.venuesList, message);
      return;
    }

    refs.venuesList.innerHTML = "";

    state.filteredVenues.forEach((venue) => {
      const fragment = refs.venueCardTemplate.content.cloneNode(true);
      fillVenueCard(fragment, venue);
      refs.venuesList.appendChild(fragment);
    });
  }

  function renderPendingVenues() {
    if (!refs.reviewList || !refs.reviewCardTemplate) {
      return;
    }

    if (!state.session) {
      renderEmptyState(
        refs.reviewList,
        "Увійдіть як рев’юер, щоб побачити pending-записи."
      );
      refs.pendingCount.textContent = "pending приховано";
      return;
    }

    if (!state.isReviewer) {
      renderEmptyState(
        refs.reviewList,
        "Цей акаунт не доданий до таблиці reviewers."
      );
      refs.pendingCount.textContent = "pending приховано";
      return;
    }

    if (!state.pendingVenues.length) {
      renderEmptyState(refs.reviewList, "Усі заявки вже оброблені.");
      refs.pendingCount.textContent = "0 очікує рев’ю";
      return;
    }

    refs.reviewList.innerHTML = "";

    state.pendingVenues.forEach((venue) => {
      const fragment = refs.reviewCardTemplate.content.cloneNode(true);
      fillReviewCard(fragment, venue);
      refs.reviewList.appendChild(fragment);
    });
  }

  function fillVenueCard(fragment, venue) {
    fragment.querySelector(".venue-name").textContent = venue.name;
    fragment.querySelector(".map-link").href = venue.google_maps_url;
    fragment.querySelector(".comment-block").innerHTML = formatRichText(venue.comment);
    fragment.querySelector(".meta-date").textContent = `Додано: ${formatDate(venue.created_at)}`;
    fillOwners(fragment, venue.owners);
  }

  function fillReviewCard(fragment, venue) {
    fragment.querySelector(".review-name").textContent = venue.name;
    fragment.querySelector(".review-date").textContent = `Надіслано: ${formatDate(venue.created_at)}`;
    fragment.querySelector(".map-link").href = venue.google_maps_url;
    fragment.querySelector(".comment-block").innerHTML = formatRichText(venue.comment);

    const approveButton = fragment.querySelector(".approve-button");
    approveButton.dataset.action = "approve";
    approveButton.dataset.id = venue.id;

    const rejectButton = fragment.querySelector(".reject-button");
    rejectButton.dataset.action = "reject";
    rejectButton.dataset.id = venue.id;

    fillOwners(fragment, venue.owners);
  }

  function fillOwners(fragment, owners) {
    const ownersRow = fragment.querySelector(".owners-row");
    if (!owners) {
      ownersRow.hidden = true;
      return;
    }

    ownersRow.hidden = false;
    ownersRow.textContent = `Власники / нотатка: ${owners}`;
  }

  function renderEmptyState(container, message) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function setMessage(element, message, className) {
    element.textContent = message;
    element.className = `form-message ${className || ""}`.trim();
  }

  async function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId = null;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function getErrorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }

    return "Сталася неочікувана помилка. Спробуйте ще раз.";
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatRichText(value) {
    const escaped = escapeHtml(value).replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
    );

    return escaped.replaceAll("\n", "<br />");
  }

  function formatDate(value) {
    const formatter = new Intl.DateTimeFormat("uk-UA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return formatter.format(new Date(value));
  }
})();
