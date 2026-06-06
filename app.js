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
    adminApprovedList: document.getElementById("admin-approved-list"),
    publicSuccessBanner: document.getElementById("public-success-banner"),
    publicSuccessText: document.getElementById("public-success-text"),
    venueCardTemplate: document.getElementById("venue-card-template"),
    reviewCardTemplate: document.getElementById("review-card-template"),
    adminApprovedCardTemplate: document.getElementById("admin-approved-card-template"),
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
    refreshApprovedButton: document.getElementById("refresh-approved-button"),
    reviewList: document.getElementById("review-list"),
    layoutButtons: document.querySelectorAll("[data-layout-mode]"),
    viewButtons: document.querySelectorAll("[data-view-target]"),
    views: document.querySelectorAll(".view"),
  };

  const state = {
    approvedVenues: [],
    filteredVenues: [],
    pendingVenues: [],
    session: null,
    isReviewer: false,
    layoutMode: "grid",
  };

  let supabase = null;
  let publicNoticeTimeoutId = null;
  const PUBLIC_LAYOUT_STORAGE_KEY = "noru-public-layout-mode";
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
    bindLayoutSwitcher();
    bindSearch();
    bindVenueForm();
    bindReviewerActions();
    loadSavedLayoutMode();

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
      hasApprovedViews() ? loadApprovedVenues() : Promise.resolve(),
      pageMode === "admin" && state.isReviewer ? loadPendingVenues() : Promise.resolve(),
    ]);
  }

  function hasApprovedViews() {
    return Boolean(refs.venuesList || refs.adminApprovedList);
  }

  function bindViewSwitcher() {
    if (!refs.viewButtons.length || refs.viewButtons.length < 2) {
      return;
    }

    refs.viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setActiveView(button.dataset.viewTarget);
      });
    });
  }

  function setActiveView(targetId) {
    if (!targetId) {
      return;
    }

    refs.viewButtons.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.viewTarget === targetId);
    });
    refs.views.forEach((view) => {
      view.classList.toggle("is-visible", view.id === targetId);
    });

    const targetView = document.getElementById(targetId);
    if (targetView) {
      targetView.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function bindSearch() {
    if (!refs.searchInput) {
      return;
    }

    refs.searchInput.addEventListener("input", () => {
      applySearchFilter();
      renderPublicApprovedVenues();
    });
  }

  function bindLayoutSwitcher() {
    if (!refs.layoutButtons.length) {
      return;
    }

    refs.layoutButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyLayoutMode(button.dataset.layoutMode);
      });
    });
  }

  function loadSavedLayoutMode() {
    if (!refs.layoutButtons.length) {
      return;
    }

    let savedMode = "grid";

    try {
      const value = window.localStorage.getItem(PUBLIC_LAYOUT_STORAGE_KEY);
      if (value === "grid" || value === "list") {
        savedMode = value;
      }
    } catch (_error) {
      savedMode = "grid";
    }

    applyLayoutMode(savedMode, { persist: false });
  }

  function applyLayoutMode(mode, options = {}) {
    const nextMode = mode === "list" ? "list" : "grid";
    const { persist = true } = options;

    state.layoutMode = nextMode;

    refs.layoutButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.layoutMode === nextMode);
    });

    if (refs.venuesList) {
      refs.venuesList.classList.toggle("is-list-layout", nextMode === "list");
    }

    if (persist) {
      try {
        window.localStorage.setItem(PUBLIC_LAYOUT_STORAGE_KEY, nextMode);
      } catch (_error) {
        // Ignore storage failures and keep the UI responsive.
      }
    }
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
        setActiveView("list-view");
        showPublicSuccess(
          "Дякуємо. Запис збережено й відправлено на перевірку адміністратора."
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

    if (refs.refreshApprovedButton) {
      refs.refreshApprovedButton.addEventListener("click", async () => {
        refs.refreshApprovedButton.disabled = true;
        await loadApprovedVenues();
        refs.refreshApprovedButton.disabled = false;
      });
    }

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
      const button = event.target.closest("button");
      if (!button || !state.isReviewer) {
        return;
      }

      const action = button.dataset.action;
      if (button.classList.contains("edit-button")) {
        toggleInlineEdit(button.closest(".review-card"), true);
        return;
      }

      if (action === "cancel-edit") {
        toggleInlineEdit(button.closest(".review-card"), false);
        return;
      }

      if (!action) {
        return;
      }

      const venueId = Number(button.dataset.id);
      await handleAdminVenueAction(button, venueId, action);
    });

    refs.reviewList.addEventListener("submit", async (event) => {
      const form = event.target.closest(".inline-edit-form");
      if (!form || !state.isReviewer) {
        return;
      }

      event.preventDefault();
      await handleEditSubmit(form);
    });

    if (refs.adminApprovedList) {
      refs.adminApprovedList.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button || !state.isReviewer) {
          return;
        }

        const action = button.dataset.action;
        if (button.classList.contains("edit-button")) {
          toggleInlineEdit(button.closest(".review-card"), true);
          return;
        }

        if (action === "cancel-edit") {
          toggleInlineEdit(button.closest(".review-card"), false);
          return;
        }

        if (!action) {
          return;
        }

        const venueId = Number(button.dataset.id);
        await handleAdminVenueAction(button, venueId, action);
      });

      refs.adminApprovedList.addEventListener("submit", async (event) => {
        const form = event.target.closest(".inline-edit-form");
        if (!form || !state.isReviewer) {
          return;
        }

        event.preventDefault();
        await handleEditSubmit(form);
      });
    }
  }

  async function handleAdminVenueAction(button, venueId, action) {
    if (!supabase || !state.isReviewer) {
      return;
    }

    const venue = [...state.pendingVenues, ...state.approvedVenues].find(
      (item) => item.id === venueId
    );

    if (
      action === "delete" &&
      !window.confirm(`Видалити запис "${venue?.name || "без назви"}"?`)
    ) {
      return;
    }

    button.disabled = true;

    try {
      if (action === "approve" || action === "reject") {
        await updateVenueStatus(venueId, action);
      } else if (action === "delete") {
        await deleteVenue(venueId);
      }

      await Promise.all([loadPendingVenues(), loadApprovedVenues()]);

      const successMessage =
        action === "approve"
          ? "Заклад апрувнуто."
          : action === "reject"
            ? "Заклад відхилено."
            : "Запис видалено.";
      setMessage(refs.loginMessage, successMessage, "is-success");
    } catch (error) {
      setMessage(refs.loginMessage, getErrorMessage(error), "is-error");
    } finally {
      button.disabled = false;
    }
  }

  async function updateVenueStatus(venueId, action) {
    const nextStatus = action === "approve" ? "approved" : "rejected";
    const updatePayload = {
      status: nextStatus,
      approved_at: action === "approve" ? new Date().toISOString() : null,
      approved_by:
        action === "approve" && state.session ? state.session.user.id : null,
    };

    const { error } = await withTimeout(
      supabase.from("venues").update(updatePayload).eq("id", venueId),
      REQUEST_TIMEOUT_MS,
      "Час очікування вичерпано під час оновлення статусу."
    );

    if (error) {
      throw error;
    }
  }

  async function deleteVenue(venueId) {
    const { error } = await withTimeout(
      supabase.from("venues").delete().eq("id", venueId),
      REQUEST_TIMEOUT_MS,
      "Час очікування вичерпано під час видалення запису."
    );

    if (error) {
      throw error;
    }
  }

  async function handleEditSubmit(form) {
    if (!supabase || !state.isReviewer) {
      return;
    }

    const venueId = Number(form.dataset.id);
    const submitButton = form.querySelector(".save-edit-button");
    const payload = {
      name: form.querySelector(".edit-name-input").value.trim(),
      google_maps_url: form.querySelector(".edit-maps-input").value.trim(),
      comment: form.querySelector(".edit-comment-input").value.trim(),
      owners: form.querySelector(".edit-owners-input").value.trim() || null,
    };

    submitButton.disabled = true;

    try {
      const { error } = await withTimeout(
        supabase.from("venues").update(payload).eq("id", venueId),
        REQUEST_TIMEOUT_MS,
        "Час очікування вичерпано під час збереження змін."
      );

      if (error) {
        throw error;
      }

      await Promise.all([loadPendingVenues(), loadApprovedVenues()]);
      setMessage(refs.loginMessage, "Запис оновлено.", "is-success");
    } catch (error) {
      setMessage(refs.loginMessage, getErrorMessage(error), "is-error");
    } finally {
      submitButton.disabled = false;
    }
  }

  function toggleInlineEdit(card, shouldOpen) {
    if (!card) {
      return;
    }

    const form = card.querySelector(".inline-edit-form");
    if (!form) {
      return;
    }

    form.hidden = !shouldOpen;
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
        await loadApprovedVenues();
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
      renderAdminApprovedVenues();
      return;
    }

    refs.reviewerEmailLabel.textContent = state.session.user.email || "Без email";
    refs.reviewerRoleLabel.textContent = state.isReviewer
      ? "Роль: reviewer"
      : "Користувач залогінений, але ще не має reviewer-доступу.";
    refs.claimReviewerButton.hidden = state.isReviewer;
    renderPendingVenues();
    renderAdminApprovedVenues();
  }

  async function loadApprovedVenues() {
    if (!hasApprovedViews()) {
      return;
    }

    const { data, error } = await supabase
      .from("venues")
      .select("id, name, google_maps_url, comment, owners, created_at, approved_at")
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
    renderPublicApprovedVenues();
    renderAdminApprovedVenues();
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

  function renderPublicApprovedVenues() {
    if (!refs.venuesList || !refs.venueCardTemplate) {
      return;
    }

    refs.venuesList.classList.toggle(
      "is-list-layout",
      state.layoutMode === "list"
    );

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

  function renderAdminApprovedVenues() {
    if (!refs.adminApprovedList || !refs.adminApprovedCardTemplate) {
      return;
    }

    if (!state.session) {
      renderEmptyState(
        refs.adminApprovedList,
        "Увійдіть як адміністратор, щоб керувати опублікованими записами."
      );
      return;
    }

    if (!state.isReviewer) {
      renderEmptyState(
        refs.adminApprovedList,
        "Цей акаунт не має reviewer-доступу."
      );
      return;
    }

    if (!state.approvedVenues.length) {
      renderEmptyState(
        refs.adminApprovedList,
        "Поки що немає жодного опублікованого запису."
      );
      return;
    }

    refs.adminApprovedList.innerHTML = "";

    state.approvedVenues.forEach((venue) => {
      const fragment = refs.adminApprovedCardTemplate.content.cloneNode(true);
      fillReviewCard(fragment, venue, {
        deleteOnly: true,
        dateLabel: "Опубліковано",
        dateValue: venue.approved_at || venue.created_at,
      });
      refs.adminApprovedList.appendChild(fragment);
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

  function fillReviewCard(fragment, venue, options = {}) {
    const {
      deleteOnly = false,
      dateLabel = "Надіслано",
      dateValue = venue.created_at,
    } = options;

    fragment.querySelector(".review-name").textContent = venue.name;
    fragment.querySelector(".review-date").textContent = `${dateLabel}: ${formatDate(dateValue)}`;
    fragment.querySelector(".map-link").href = venue.google_maps_url;
    fragment.querySelector(".comment-block").innerHTML = formatRichText(venue.comment);

    const approveButton = fragment.querySelector(".approve-button");
    if (approveButton) {
      approveButton.dataset.action = "approve";
      approveButton.dataset.id = venue.id;
      approveButton.hidden = deleteOnly;
    }

    const rejectButton = fragment.querySelector(".reject-button");
    if (rejectButton) {
      rejectButton.dataset.action = "reject";
      rejectButton.dataset.id = venue.id;
      rejectButton.hidden = deleteOnly;
    }

    const deleteButton = fragment.querySelector(".delete-button");
    if (deleteButton) {
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = venue.id;
    }

    const editForm = fragment.querySelector(".inline-edit-form");
    if (editForm) {
      editForm.dataset.id = venue.id;
      editForm.querySelector(".edit-name-input").value = venue.name;
      editForm.querySelector(".edit-maps-input").value = venue.google_maps_url;
      editForm.querySelector(".edit-comment-input").value = venue.comment;
      editForm.querySelector(".edit-owners-input").value = venue.owners || "";
    }

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

  function showPublicSuccess(message) {
    if (!refs.publicSuccessBanner || !refs.publicSuccessText) {
      return;
    }

    refs.publicSuccessText.textContent = message;
    refs.publicSuccessBanner.hidden = false;

    if (publicNoticeTimeoutId !== null) {
      window.clearTimeout(publicNoticeTimeoutId);
    }

    publicNoticeTimeoutId = window.setTimeout(() => {
      refs.publicSuccessBanner.hidden = true;
      publicNoticeTimeoutId = null;
    }, 6000);
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
