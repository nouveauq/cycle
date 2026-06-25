(function () {
  var APP_ID = "cycle-together";
  var LAST_BACKUP_KEY = "cycle-together.telegram.last-backup.v1";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var POLL_MS = 5000;
  var SYMPTOMS = [
    { key: "cramps", label: "Спазмы" },
    { key: "headache", label: "Головная боль" },
    { key: "bloating", label: "Вздутие" },
    { key: "breasts", label: "Чувствительность груди" },
    { key: "acne", label: "Акне" },
    { key: "cravings", label: "Тяга к сладкому" },
    { key: "insomnia", label: "Плохой сон" },
    { key: "irritability", label: "Раздражительность" },
    { key: "anxiety", label: "Тревожность" },
    { key: "high-libido", label: "Повышенное желание" },
    { key: "low-libido", label: "Пониженное желание" },
    { key: "sex", label: "Секс" },
    { key: "spotting", label: "Небольшие выделения" },
  ];
  var FLOW_LABELS = {
    spotting: "Мажущие выделения",
    light: "Лёгкая",
    medium: "Средняя",
    heavy: "Сильная",
  };

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var state = {
    settings: {
      cycleLength: 28,
      periodLength: 5,
      lutealLength: 14,
    },
    periods: {},
    logs: {},
    members: [],
    memberLimit: 2,
    user: null,
    calendarId: "",
    revision: 0,
    ready: false,
    syncStatus: "Загрузка…",
    syncMeta: "Подключаюсь к серверу бота.",
  };
  var uiState = {
    viewMonth: todayISO().slice(0, 7),
    periodYearFilter: "all",
    logFilter: "all",
    cycleChartRange: "6m",
    symptomChartRange: "6m",
  };
  var elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupTelegram();
    cacheElements();
    renderSymptomOptions();
    bindEvents();
    resetPeriodForm();
    resetLogForm();
    syncSettingsForm();
    renderLastBackupMeta();
    render();
    loadSession();
    window.setInterval(refreshCalendar, POLL_MS);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        refreshCalendar();
      }
    });
  }

  function setupTelegram() {
    if (!tg) {
      return;
    }
    tg.ready();
    tg.expand();
    if (tg.themeParams && tg.themeParams.bg_color) {
      document.documentElement.style.setProperty("--telegram-bg", tg.themeParams.bg_color);
    }
  }

  function cacheElements() {
    elements.telegramStatus = document.getElementById("telegramStatus");
    elements.statsGrid = document.getElementById("statsGrid");
    elements.syncStatus = document.getElementById("syncStatus");
    elements.syncMeta = document.getElementById("syncMeta");
    elements.calendarMonthLabel = document.getElementById("calendarMonthLabel");
    elements.calendarGrid = document.getElementById("calendarGrid");
    elements.calendarInsights = document.getElementById("calendarInsights");
    elements.periodPanel = document.getElementById("periodPanel");
    elements.periodYearFilter = document.getElementById("periodYearFilter");
    elements.periodSummaryMeta = document.getElementById("periodSummaryMeta");
    elements.periodSummaryAction = document.getElementById("periodSummaryAction");
    elements.periodHistory = document.getElementById("periodHistory");
    elements.logPanel = document.getElementById("logPanel");
    elements.logMonthFilter = document.getElementById("logMonthFilter");
    elements.logSummaryMeta = document.getElementById("logSummaryMeta");
    elements.logSummaryAction = document.getElementById("logSummaryAction");
    elements.logHistory = document.getElementById("logHistory");
    elements.membersList = document.getElementById("membersList");
    elements.createInvite = document.getElementById("createInvite");
    elements.inviteOutput = document.getElementById("inviteOutput");
    elements.inviteCode = document.getElementById("inviteCode");
    elements.inviteLink = document.getElementById("inviteLink");
    elements.copyInvite = document.getElementById("copyInvite");
    elements.shareInvite = document.getElementById("shareInvite");
    elements.inviteStatus = document.getElementById("inviteStatus");
    elements.exportBackup = document.getElementById("exportBackup");
    elements.importBackup = document.getElementById("importBackup");
    elements.backupFileInput = document.getElementById("backupFileInput");
    elements.backupStatus = document.getElementById("backupStatus");
    elements.lastBackupMeta = document.getElementById("lastBackupMeta");
    elements.cycleChart = document.getElementById("cycleChart");
    elements.symptomChart = document.getElementById("symptomChart");
    elements.cycleChartControls = document.getElementById("cycleChartControls");
    elements.symptomChartControls = document.getElementById("symptomChartControls");
    elements.insightsList = document.getElementById("insightsList");
    elements.periodForm = document.getElementById("periodForm");
    elements.periodId = document.getElementById("periodId");
    elements.periodStart = document.getElementById("periodStart");
    elements.periodEnd = document.getElementById("periodEnd");
    elements.periodFlow = document.getElementById("periodFlow");
    elements.periodNote = document.getElementById("periodNote");
    elements.cancelPeriodEdit = document.getElementById("cancelPeriodEdit");
    elements.logForm = document.getElementById("logForm");
    elements.logId = document.getElementById("logId");
    elements.logDate = document.getElementById("logDate");
    elements.logWellbeing = document.getElementById("logWellbeing");
    elements.logEnergy = document.getElementById("logEnergy");
    elements.logMood = document.getElementById("logMood");
    elements.logLibido = document.getElementById("logLibido");
    elements.logPain = document.getElementById("logPain");
    elements.logNote = document.getElementById("logNote");
    elements.cancelLogEdit = document.getElementById("cancelLogEdit");
    elements.symptomList = document.getElementById("symptomList");
    elements.settingsForm = document.getElementById("settingsForm");
    elements.cycleLengthSetting = document.getElementById("cycleLengthSetting");
    elements.periodLengthSetting = document.getElementById("periodLengthSetting");
    elements.lutealLengthSetting = document.getElementById("lutealLengthSetting");
    elements.prevMonth = document.getElementById("prevMonth");
    elements.nextMonth = document.getElementById("nextMonth");
    elements.todayMonth = document.getElementById("todayMonth");
  }

  function bindEvents() {
    elements.periodForm.addEventListener("submit", onPeriodSubmit);
    elements.logForm.addEventListener("submit", onLogSubmit);
    elements.settingsForm.addEventListener("submit", onSettingsSubmit);
    elements.cancelPeriodEdit.addEventListener("click", resetPeriodForm);
    elements.cancelLogEdit.addEventListener("click", resetLogForm);
    elements.prevMonth.addEventListener("click", function () {
      uiState.viewMonth = shiftMonth(uiState.viewMonth, -1);
      renderCalendar();
    });
    elements.nextMonth.addEventListener("click", function () {
      uiState.viewMonth = shiftMonth(uiState.viewMonth, 1);
      renderCalendar();
    });
    elements.todayMonth.addEventListener("click", function () {
      uiState.viewMonth = todayISO().slice(0, 7);
      renderCalendar();
    });
    elements.calendarGrid.addEventListener("click", onCalendarClick);
    elements.periodHistory.addEventListener("click", onPeriodHistoryAction);
    elements.periodPanel.addEventListener("toggle", renderPeriods);
    elements.periodYearFilter.addEventListener("change", function () {
      uiState.periodYearFilter = elements.periodYearFilter.value || "all";
      renderPeriods();
    });
    elements.logHistory.addEventListener("click", onLogHistoryAction);
    elements.logPanel.addEventListener("toggle", renderLogs);
    elements.logMonthFilter.addEventListener("change", function () {
      uiState.logFilter = elements.logMonthFilter.value || "all";
      renderLogs();
    });
    elements.createInvite.addEventListener("click", onCreateInvite);
    elements.copyInvite.addEventListener("click", onCopyInvite);
    elements.shareInvite.addEventListener("click", onShareInvite);
    elements.exportBackup.addEventListener("click", onExportBackup);
    elements.importBackup.addEventListener("click", function () {
      elements.backupFileInput.value = "";
      elements.backupFileInput.click();
    });
    elements.backupFileInput.addEventListener("change", onBackupFileSelected);
    elements.cycleChartControls.addEventListener("click", onCycleChartRangeClick);
    elements.symptomChartControls.addEventListener("click", onSymptomChartRangeClick);
  }

  function renderSymptomOptions() {
    elements.symptomList.innerHTML = SYMPTOMS.map(function (symptom) {
      return (
        '<label class="symptom-chip">' +
        '<input type="checkbox" value="' +
        symptom.key +
        '" />' +
        "<span>" +
        escapeHtml(symptom.label) +
        "</span>" +
        "</label>"
      );
    }).join("");
  }

  function getStartParam() {
    var query = new URLSearchParams(window.location.search);
    return (
      query.get("startapp") ||
      query.get("start") ||
      (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
      ""
    );
  }

  function getDevUser() {
    var query = new URLSearchParams(window.location.search);
    return query.get("dev_user") || query.get("name") || "";
  }

  function getAuthHeaders() {
    var headers = {
      "Content-Type": "application/json",
    };
    if (tg && tg.initData) {
      headers["X-Telegram-Init-Data"] = tg.initData;
    }
    var devUser = getDevUser();
    if (devUser) {
      headers["X-Dev-User"] = devUser;
    }
    return headers;
  }

  function apiFetch(path, options) {
    options = options || {};
    var requestOptions = {
      method: options.method || "GET",
      headers: getAuthHeaders(),
    };
    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }
    return fetch(path, requestOptions)
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || data.ok === false) {
            var message = data && data.error ? data.error : "Сервер вернул ошибку.";
            throw new Error(message);
          }
          return data;
        });
      });
  }

  function loadSession() {
    setSync("Загрузка…", "Получаю календарь с сервера.");
    apiFetch("/api/session?start=" + encodeURIComponent(getStartParam()))
      .then(function (data) {
        state.user = data.user;
        applyServerCalendar(data.calendar);
        state.ready = true;
        setSync("Синхронизировано", "Календарь готов.");
        render();
      })
      .catch(function (error) {
        console.error(error);
        state.ready = false;
        setSync("Не удалось загрузить календарь", error.message);
        renderSyncStatus();
      });
  }

  function refreshCalendar() {
    if (!state.ready || document.hidden) {
      return;
    }
    apiFetch("/api/calendar")
      .then(function (data) {
        if (data.calendar && data.calendar.revision !== state.revision) {
          applyServerCalendar(data.calendar);
          setSync("Синхронизировано", "Получены свежие изменения.");
          render();
        }
      })
      .catch(function (error) {
        console.warn(error);
        setSync("Связь нестабильна", error.message);
        renderSyncStatus();
      });
  }

  function applyServerCalendar(calendar) {
    state.calendarId = calendar.id;
    state.revision = calendar.revision || 0;
    state.members = calendar.members || [];
    state.memberLimit = calendar.memberLimit || 2;
    applySnapshot(calendar.snapshot || {});
  }

  function applySnapshot(snapshot) {
    state.settings = Object.assign(
      {
        cycleLength: 28,
        periodLength: 5,
        lutealLength: 14,
      },
      snapshot.settings || {}
    );
    state.periods = recordsToMap(snapshot.periods || []);
    state.logs = recordsToMap(snapshot.logs || []);
    syncSettingsForm();
  }

  function recordsToMap(records) {
    var map = {};
    (Array.isArray(records) ? records : Object.keys(records || {}).map(function (key) { return records[key]; })).forEach(
      function (record) {
        if (record && record.id) {
          map[record.id] = record;
        }
      }
    );
    return map;
  }

  function setSync(status, meta) {
    state.syncStatus = status;
    state.syncMeta = meta;
    if (elements.syncStatus) {
      renderSyncStatus();
    }
    if (elements.telegramStatus) {
      elements.telegramStatus.textContent = meta || status;
    }
  }

  function onPeriodSubmit(event) {
    event.preventDefault();
    var startDate = elements.periodStart.value;
    var endDate = elements.periodEnd.value;
    var existingId = elements.periodId.value;
    if (!startDate || !endDate) {
      window.alert("Укажи дату начала и конца менструации.");
      return;
    }
    if (compareIsoDates(startDate, endDate) > 0) {
      window.alert("Дата окончания не может быть раньше даты начала.");
      return;
    }
    setSync("Сохраняю…", "Отправляю цикл на сервер.");
    apiFetch("/api/periods", {
      method: "POST",
      body: {
        record: {
          id: existingId || createId("period"),
          startDate: startDate,
          endDate: endDate,
          flow: elements.periodFlow.value,
          note: elements.periodNote.value.trim(),
        },
      },
    })
      .then(afterMutation("Цикл сохранён."))
      .then(resetPeriodForm)
      .catch(showMutationError);
  }

  function onLogSubmit(event) {
    event.preventDefault();
    var logDate = elements.logDate.value;
    var existingId = elements.logId.value;
    if (!logDate) {
      window.alert("Выбери дату для записи.");
      return;
    }
    setSync("Сохраняю…", "Отправляю запись на сервер.");
    apiFetch("/api/logs", {
      method: "POST",
      body: {
        record: {
          id: existingId || createId("log"),
          date: logDate,
          wellbeing: Number(elements.logWellbeing.value),
          energy: Number(elements.logEnergy.value),
          mood: Number(elements.logMood.value),
          libido: Number(elements.logLibido.value),
          pain: Number(elements.logPain.value),
          symptoms: readSelectedSymptoms(),
          note: elements.logNote.value.trim(),
        },
      },
    })
      .then(afterMutation("Запись сохранена."))
      .then(resetLogForm)
      .catch(showMutationError);
  }

  function onSettingsSubmit(event) {
    event.preventDefault();
    setSync("Сохраняю…", "Обновляю настройки прогноза.");
    apiFetch("/api/settings", {
      method: "POST",
      body: {
        settings: {
          cycleLength: Number(elements.cycleLengthSetting.value),
          periodLength: Number(elements.periodLengthSetting.value),
          lutealLength: Number(elements.lutealLengthSetting.value),
        },
      },
    })
      .then(afterMutation("Настройки сохранены."))
      .catch(showMutationError);
  }

  function afterMutation(message) {
    return function (data) {
      applyServerCalendar(data.calendar);
      setSync("Синхронизировано", message);
      render();
    };
  }

  function showMutationError(error) {
    console.error(error);
    setSync("Не удалось сохранить", error.message);
    window.alert(error.message);
  }

  function onCalendarClick(event) {
    var cell = event.target.closest("[data-date]");
    if (!cell) {
      return;
    }
    elements.logDate.value = cell.getAttribute("data-date");
    document.getElementById("day-log").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onPeriodHistoryAction(event) {
    var actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }
    var id = actionButton.getAttribute("data-id");
    var record = state.periods[id];
    if (!record) {
      return;
    }
    if (actionButton.getAttribute("data-action") === "edit-period") {
      loadPeriodForEdit(record);
      return;
    }
    if (!window.confirm("Удалить эту запись цикла?")) {
      return;
    }
    apiFetch("/api/periods/" + encodeURIComponent(id), { method: "DELETE" })
      .then(afterMutation("Цикл удалён."))
      .then(resetPeriodForm)
      .catch(showMutationError);
  }

  function onLogHistoryAction(event) {
    var actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }
    var id = actionButton.getAttribute("data-id");
    var record = state.logs[id];
    if (!record) {
      return;
    }
    if (actionButton.getAttribute("data-action") === "edit-log") {
      loadLogForEdit(record);
      return;
    }
    if (!window.confirm("Удалить эту запись дня?")) {
      return;
    }
    apiFetch("/api/logs/" + encodeURIComponent(id), { method: "DELETE" })
      .then(afterMutation("Запись удалена."))
      .then(resetLogForm)
      .catch(showMutationError);
  }

  function onCreateInvite() {
    setInviteStatus("Создаю ссылку…");
    apiFetch("/api/invite", { method: "POST", body: {} })
      .then(function (data) {
        elements.inviteOutput.classList.remove("hidden");
        elements.inviteCode.textContent = "Код: " + data.code + ". Ссылка действует до " + formatDateTime(data.expiresAt) + ".";
        elements.inviteLink.value = data.link || data.directAppLink || data.code;
        setInviteStatus("Готово. Отправь ссылку второму участнику.");
      })
      .catch(function (error) {
        setInviteStatus(error.message);
      });
  }

  function onCopyInvite() {
    var value = elements.inviteLink.value;
    if (!value) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        setInviteStatus("Ссылка скопирована.");
      });
      return;
    }
    elements.inviteLink.focus();
    elements.inviteLink.select();
    document.execCommand("copy");
    setInviteStatus("Ссылка скопирована.");
  }

  function onShareInvite() {
    var value = elements.inviteLink.value;
    if (!value) {
      return;
    }
    var text = "Приглашение в общий календарь Cycle Together";
    if (navigator.share) {
      navigator.share({ title: "Cycle Together", text: text, url: value }).catch(function () {});
      return;
    }
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(value) + "&text=" + encodeURIComponent(text));
      return;
    }
    onCopyInvite();
  }

  function onExportBackup() {
    if (state.user && String(state.user.id || "").match(/^\d+$/)) {
      setBackupStatus("Отправляю backup в чат с ботом…");
      apiFetch("/api/export-to-chat", {
        method: "POST",
        body: {},
      })
        .then(function (data) {
          rememberLastBackup(new Date().toISOString());
          setBackupStatus("Бот отправил файл " + data.fileName + " в чат.");
        })
        .catch(function (error) {
          console.error(error);
          setBackupStatus("Не удалось отправить через бота. Пробую скачать файл…");
          downloadBackupInBrowser();
        });
      return;
    }
    downloadBackupInBrowser();
  }

  function downloadBackupInBrowser() {
    try {
      var snapshot = buildExportSnapshot();
      var fileName = buildBackupFilename(snapshot.exportedAt);
      downloadTextFile(fileName, JSON.stringify(snapshot, null, 2), "application/json");
      rememberLastBackup(snapshot.exportedAt);
      setBackupStatus("Файл " + fileName + " подготовлен.");
    } catch (error) {
      console.error(error);
      setBackupStatus("Не удалось создать backup.");
      window.alert("Не удалось экспортировать данные календаря.");
    }
  }

  function onBackupFileSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    file
      .text()
      .then(function (text) {
        var snapshot = parseBackupText(text);
        var message =
          "Импорт заменит текущие данные этого календаря для обоих участников.\n\n" +
          "Циклы: " +
          snapshot.periods.length +
          "\nЗаписи: " +
          snapshot.logs.length;
        if (!window.confirm(message)) {
          return;
        }
        setBackupStatus("Импортирую backup…");
        return apiFetch("/api/import", {
          method: "POST",
          body: {
            snapshot: snapshot,
          },
        }).then(function (data) {
          applyServerCalendar(data.calendar);
          resetPeriodForm();
          resetLogForm();
          setBackupStatus("Backup импортирован.");
          setSync("Синхронизировано", "Данные импортированы.");
          render();
        });
      })
      .catch(function (error) {
        console.error(error);
        setBackupStatus("Файл не удалось импортировать.");
        window.alert(error.message || "Не удалось импортировать файл.");
      })
      .finally(function () {
        elements.backupFileInput.value = "";
      });
  }

  function buildExportSnapshot() {
    return {
      app: APP_ID,
      type: "cycle-together-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        name: state.user ? state.user.name : "Участник",
        addr: state.user ? state.user.addr : "telegram",
      },
      settings: {
        cycleLength: Number(state.settings.cycleLength || 28),
        periodLength: Number(state.settings.periodLength || 5),
        lutealLength: Number(state.settings.lutealLength || 14),
      },
      periods: getPeriodsSortedAsc().map(cloneRecord),
      logs: getLogsSortedDesc().slice().reverse().map(cloneRecord),
    };
  }

  function parseBackupText(text) {
    var raw = JSON.parse(text);
    if (!raw || raw.app !== APP_ID || raw.type !== "cycle-together-backup") {
      throw new Error("Это не backup Cycle Together.");
    }
    return normalizeSnapshot(raw);
  }

  function normalizeSnapshot(raw) {
    return {
      settings: {
        cycleLength: clampNumber(raw.settings && raw.settings.cycleLength, 20, 45, 28),
        periodLength: clampNumber(raw.settings && raw.settings.periodLength, 2, 10, 5),
        lutealLength: clampNumber(raw.settings && raw.settings.lutealLength, 10, 18, 14),
      },
      periods: normalizePeriodRecords(raw.periods || []),
      logs: normalizeLogRecords(raw.logs || []),
    };
  }

  function normalizePeriodRecords(records) {
    return (Array.isArray(records) ? records : Object.keys(records || {}).map(function (key) { return records[key]; }))
      .map(function (record, index) {
        if (!record || !record.startDate || !record.endDate) {
          return null;
        }
        return {
          id: record.id || "period-import-" + index,
          startDate: record.startDate,
          endDate: record.endDate,
          flow: FLOW_LABELS[record.flow] ? record.flow : "medium",
          note: String(record.note || ""),
          authorName: String(record.authorName || (state.user && state.user.name) || "Участник"),
          authorAddr: String(record.authorAddr || (state.user && state.user.addr) || "telegram"),
          updatedAt: record.updatedAt || new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .sort(function (left, right) {
        return compareIsoDates(left.startDate, right.startDate);
      });
  }

  function normalizeLogRecords(records) {
    return (Array.isArray(records) ? records : Object.keys(records || {}).map(function (key) { return records[key]; }))
      .map(function (record, index) {
        if (!record || !record.date) {
          return null;
        }
        return {
          id: record.id || "log-import-" + index,
          date: record.date,
          wellbeing: clampNumber(record.wellbeing, 1, 5, 3),
          energy: clampNumber(record.energy, 1, 5, 3),
          mood: clampNumber(record.mood, 1, 5, 3),
          libido: clampNumber(record.libido, 1, 5, 3),
          pain: clampNumber(record.pain, 0, 5, 3),
          symptoms: normalizeSymptoms(record.symptoms || []),
          note: String(record.note || ""),
          authorName: String(record.authorName || (state.user && state.user.name) || "Участник"),
          authorAddr: String(record.authorAddr || (state.user && state.user.addr) || "telegram"),
          updatedAt: record.updatedAt || new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .sort(function (left, right) {
        return compareIsoDates(left.date, right.date);
      });
  }

  function render() {
    renderSyncStatus();
    renderStats();
    renderCalendar();
    renderMembers();
    renderPeriods();
    renderLogs();
    renderCharts();
    renderInsights();
  }

  function renderSyncStatus() {
    elements.syncStatus.textContent = state.syncStatus;
    elements.syncMeta.textContent = state.syncMeta;
    elements.telegramStatus.textContent = state.user
      ? "Открыто для: " + state.user.name + ". Все изменения сохраняются автоматически."
      : state.syncMeta;
  }

  function renderStats() {
    var model = buildAnalysis();
    var cards = [
      {
        label: "Фаза и день цикла",
        value: model.currentPhase.title,
        meta: model.currentPhase.meta,
      },
      {
        label: "Следующая менструация",
        value: model.nextPeriodStart ? formatPrettyDate(model.nextPeriodStart) : "Недостаточно данных",
        meta: model.nextPeriodMeta,
      },
      {
        label: "Овуляция",
        value: model.ovulationDate ? formatPrettyDate(model.ovulationDate) : "Недостаточно данных",
        meta: model.ovulationMeta,
      },
      {
        label: "Средний цикл",
        value: model.averageCycle + " дн.",
        meta: model.averageCycleMeta,
      },
    ];
    elements.statsGrid.innerHTML = cards
      .map(function (card) {
        return (
          '<article class="stat-card">' +
          '<p class="stat-label">' +
          escapeHtml(card.label) +
          "</p>" +
          '<p class="stat-value">' +
          escapeHtml(card.value) +
          "</p>" +
          '<p class="stat-meta">' +
          escapeHtml(card.meta) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderCalendar() {
    var model = buildAnalysis();
    var monthInfo = getMonthInfo(uiState.viewMonth);
    elements.calendarMonthLabel.textContent = monthInfo.label;
    elements.calendarGrid.innerHTML = buildCalendarHtml(model, monthInfo);
    elements.calendarInsights.innerHTML = buildCalendarInsights(model);
  }

  function renderMembers() {
    var members = state.members || [];
    elements.membersList.innerHTML = members.length
      ? members
          .map(function (member) {
            var role = member.role === "owner" ? "создатель" : "участник";
            return (
              '<div class="member-row">' +
              '<span class="member-name">' +
              escapeHtml(member.displayName || "Участник") +
              "</span>" +
              '<span class="member-role">' +
              role +
              "</span>" +
              "</div>"
            );
          })
          .join("")
      : '<div class="empty-state">Участники появятся после загрузки.</div>';
    elements.createInvite.disabled = members.length >= state.memberLimit;
    if (members.length >= state.memberLimit) {
      setInviteStatus("В календаре уже два участника.");
    }
  }

  function renderPeriods() {
    var periods = getPeriodsSortedDesc();
    var yearKeys = getPeriodYearKeys(periods);
    if (yearKeys.indexOf(uiState.periodYearFilter) === -1) {
      uiState.periodYearFilter = "all";
    }
    renderPeriodYearOptions(yearKeys);
    if (!periods.length) {
      elements.periodHistory.className = "data-list empty-state";
      elements.periodHistory.textContent = "Пока нет записей о менструации.";
      elements.periodYearFilter.disabled = true;
      elements.periodSummaryMeta.textContent = "Пока нет записей о менструации.";
      elements.periodSummaryAction.textContent = elements.periodPanel.open ? "Свернуть" : "Развернуть";
      return;
    }
    var cycleLengths = getPeriodCycleLengths(periods);
    var filteredPeriods =
      uiState.periodYearFilter === "all"
        ? periods
        : periods.filter(function (period) {
            return period.startDate.slice(0, 4) === uiState.periodYearFilter;
          });
    elements.periodYearFilter.disabled = yearKeys.length <= 1;
    updatePeriodSummary(periods.length, filteredPeriods.length);
    if (!filteredPeriods.length) {
      elements.periodHistory.className = "data-list empty-state";
      elements.periodHistory.textContent = "За " + uiState.periodYearFilter + " год пока нет записей.";
      return;
    }
    elements.periodHistory.className = "data-list";
    elements.periodHistory.innerHTML = filteredPeriods
      .map(function (period) {
        var cycleLength = cycleLengths[period.id];
        var duration = diffDays(period.startDate, period.endDate) + 1;
        return (
          '<article class="record-card">' +
          '<div class="record-head">' +
          "<div>" +
          '<p class="record-title">' +
          escapeHtml(formatDateRange(period.startDate, period.endDate)) +
          "</p>" +
          '<p class="record-subtitle">' +
          escapeHtml(FLOW_LABELS[period.flow] || "Без пометки") +
          "</p>" +
          "</div>" +
          '<div class="record-actions">' +
          '<button class="ghost-button" type="button" data-action="edit-period" data-id="' +
          escapeHtml(period.id) +
          '">Изменить</button>' +
          '<button class="ghost-button danger" type="button" data-action="delete-period" data-id="' +
          escapeHtml(period.id) +
          '">Удалить</button>' +
          "</div>" +
          "</div>" +
          '<div class="record-meta">' +
          '<span class="tag accent">Длительность: ' +
          duration +
          " дн.</span>" +
          (cycleLength ? '<span class="tag sage">Цикл: ' + cycleLength + " дн.</span>" : "") +
          "</div>" +
          (period.note ? '<p class="record-note">' + escapeHtml(period.note) + "</p>" : "") +
          '<p class="record-author">Изменил(а): ' +
          escapeHtml(period.authorName || "участник") +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderLogs() {
    var logs = getLogsSortedDesc();
    var monthKeys = getLogMonthKeys(logs);
    if (monthKeys.indexOf(uiState.logFilter) === -1) {
      uiState.logFilter = "all";
    }
    renderLogMonthOptions(monthKeys);
    var filteredLogs =
      uiState.logFilter === "all"
        ? logs
        : logs.filter(function (log) {
            return log.date.slice(0, 7) === uiState.logFilter;
          });
    if (!logs.length) {
      elements.logHistory.className = "data-list empty-state";
      elements.logHistory.textContent = "Пока нет ежедневных записей.";
      elements.logMonthFilter.disabled = true;
      elements.logSummaryMeta.textContent = "Пока нет ежедневных записей.";
      elements.logSummaryAction.textContent = elements.logPanel.open ? "Свернуть" : "Развернуть";
      return;
    }
    elements.logMonthFilter.disabled = false;
    updateLogSummary(logs.length, filteredLogs.length);
    elements.logHistory.className = "data-list";
    elements.logHistory.innerHTML = filteredLogs
      .map(function (log) {
        var symptomLabels = (log.symptoms || [])
          .map(function (key) {
            return getSymptomLabel(key);
          })
          .filter(Boolean);
        return (
          '<article class="record-card">' +
          '<div class="record-head">' +
          "<div>" +
          '<p class="record-title">' +
          escapeHtml(formatPrettyDate(log.date)) +
          "</p>" +
          '<p class="record-subtitle">Самочувствие ' +
          log.wellbeing +
          "/5, энергия " +
          log.energy +
          "/5, настроение " +
          log.mood +
          "/5</p>" +
          "</div>" +
          '<div class="record-actions">' +
          '<button class="ghost-button" type="button" data-action="edit-log" data-id="' +
          escapeHtml(log.id) +
          '">Изменить</button>' +
          '<button class="ghost-button danger" type="button" data-action="delete-log" data-id="' +
          escapeHtml(log.id) +
          '">Удалить</button>' +
          "</div>" +
          "</div>" +
          '<div class="record-meta">' +
          '<span class="tag gold">Либидо: ' +
          log.libido +
          "/5</span>" +
          '<span class="tag accent">Боль: ' +
          log.pain +
          "/5</span>" +
          "</div>" +
          (symptomLabels.length
            ? '<div class="record-meta">' +
              symptomLabels
                .map(function (label) {
                  return '<span class="tag">' + escapeHtml(label) + "</span>";
                })
                .join("") +
              "</div>"
            : "") +
          (log.note ? '<p class="record-note">' + escapeHtml(log.note) + "</p>" : "") +
          '<p class="record-author">Изменил(а): ' +
          escapeHtml(log.authorName || "участник") +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderCharts() {
    var model = buildAnalysis();
    var cycleSeries = filterCycleSeriesByRange(model.cycleSeries, uiState.cycleChartRange);
    var symptomLogs = filterLogsByRange(model.logsDesc, uiState.symptomChartRange);
    syncChartRangeButtons(elements.cycleChartControls, "data-cycle-range", uiState.cycleChartRange);
    syncChartRangeButtons(elements.symptomChartControls, "data-symptom-range", uiState.symptomChartRange);
    elements.cycleChart.innerHTML = buildCycleChart(cycleSeries, uiState.cycleChartRange);
    elements.symptomChart.innerHTML = buildSymptomChart(
      countSymptoms(symptomLogs),
      uiState.symptomChartRange,
      symptomLogs.length
    );
  }

  function renderInsights() {
    var model = buildAnalysis();
    elements.insightsList.innerHTML = model.insights
      .map(function (item) {
        return (
          '<article class="insight-card">' +
          "<h4>" +
          escapeHtml(item.title) +
          "</h4>" +
          "<p>" +
          escapeHtml(item.text) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  function loadPeriodForEdit(record) {
    elements.periodId.value = record.id;
    elements.periodStart.value = record.startDate;
    elements.periodEnd.value = record.endDate;
    elements.periodFlow.value = record.flow || "medium";
    elements.periodNote.value = record.note || "";
    elements.cancelPeriodEdit.classList.remove("hidden");
    document.getElementById("periods").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadLogForEdit(record) {
    elements.logId.value = record.id;
    elements.logDate.value = record.date;
    elements.logWellbeing.value = String(record.wellbeing || 3);
    elements.logEnergy.value = String(record.energy || 3);
    elements.logMood.value = String(record.mood || 3);
    elements.logLibido.value = String(record.libido || 3);
    elements.logPain.value = String(record.pain != null ? record.pain : 3);
    elements.logNote.value = record.note || "";
    setSelectedSymptoms(record.symptoms || []);
    elements.cancelLogEdit.classList.remove("hidden");
    document.getElementById("day-log").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetPeriodForm() {
    elements.periodId.value = "";
    elements.periodStart.value = todayISO();
    elements.periodEnd.value = todayISO();
    elements.periodFlow.value = "medium";
    elements.periodNote.value = "";
    elements.cancelPeriodEdit.classList.add("hidden");
  }

  function resetLogForm() {
    elements.logId.value = "";
    elements.logDate.value = todayISO();
    elements.logWellbeing.value = "3";
    elements.logEnergy.value = "3";
    elements.logMood.value = "3";
    elements.logLibido.value = "3";
    elements.logPain.value = "3";
    elements.logNote.value = "";
    setSelectedSymptoms([]);
    elements.cancelLogEdit.classList.add("hidden");
  }

  function syncSettingsForm() {
    if (!elements.cycleLengthSetting) {
      return;
    }
    elements.cycleLengthSetting.value = String(state.settings.cycleLength || 28);
    elements.periodLengthSetting.value = String(state.settings.periodLength || 5);
    elements.lutealLengthSetting.value = String(state.settings.lutealLength || 14);
  }

  function readSelectedSymptoms() {
    return Array.from(elements.symptomList.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function (input) {
        return input.value;
      })
      .sort();
  }

  function setSelectedSymptoms(keys) {
    var selected = new Set(keys || []);
    Array.from(elements.symptomList.querySelectorAll('input[type="checkbox"]')).forEach(function (input) {
      input.checked = selected.has(input.value);
    });
  }

  function buildAnalysis() {
    var periodsAsc = getPeriodsSortedAsc();
    var logsDesc = getLogsSortedDesc();
    var cycleLengths = [];
    var cycleSeries = [];
    var durationValues = periodsAsc.map(function (period) {
      return diffDays(period.startDate, period.endDate) + 1;
    });
    for (var index = 1; index < periodsAsc.length; index += 1) {
      var cycleDate = periodsAsc[index].startDate;
      var cycleLength = diffDays(periodsAsc[index - 1].startDate, cycleDate);
      cycleLengths.push(cycleLength);
      cycleSeries.push({
        date: cycleDate,
        value: cycleLength,
        label: formatChartDateLabel(cycleDate),
      });
    }
    var recentCycleLengths = cycleLengths.slice(-6);
    var averageCycle = recentCycleLengths.length
      ? Math.round(average(recentCycleLengths))
      : Number(state.settings.cycleLength || 28);
    var recentDurations = durationValues.slice(-6);
    var averageDuration = recentDurations.length
      ? Math.max(1, Math.round(average(recentDurations)))
      : Number(state.settings.periodLength || 5);
    var lastPeriod = periodsAsc.length ? periodsAsc[periodsAsc.length - 1] : null;
    var nextPeriodStart = lastPeriod ? addDays(lastPeriod.startDate, averageCycle) : "";
    var nextPeriodEnd = nextPeriodStart ? addDays(nextPeriodStart, averageDuration - 1) : "";
    var ovulationDate = nextPeriodStart ? addDays(nextPeriodStart, -Number(state.settings.lutealLength || 14)) : "";
    var fertileStart = ovulationDate ? addDays(ovulationDate, -5) : "";
    var fertileEnd = ovulationDate ? addDays(ovulationDate, 1) : "";
    var cycleVariation = recentCycleLengths.length
      ? Math.max.apply(null, recentCycleLengths) - Math.min.apply(null, recentCycleLengths)
      : 0;
    var currentPhase = getCurrentPhase(lastPeriod, todayISO(), nextPeriodStart, ovulationDate, fertileStart, fertileEnd);
    return {
      periodsAsc: periodsAsc,
      logsDesc: logsDesc,
      cycleLengths: cycleLengths,
      cycleSeries: cycleSeries,
      averageCycle: averageCycle,
      averageDuration: averageDuration,
      cycleVariation: cycleVariation,
      nextPeriodStart: nextPeriodStart,
      nextPeriodEnd: nextPeriodEnd,
      nextPeriodMeta: nextPeriodStart
        ? "Окно: " + formatDateRange(nextPeriodStart, nextPeriodEnd)
        : "Добавь хотя бы одну дату начала цикла.",
      ovulationDate: ovulationDate,
      fertileStart: fertileStart,
      fertileEnd: fertileEnd,
      ovulationMeta: ovulationDate ? "Фертильное окно: " + formatDateRange(fertileStart, fertileEnd) : "Появится после первой опорной даты.",
      averageCycleMeta:
        cycleLengths.length > 0
          ? "Разброс последних циклов: " + cycleVariation + " дн."
          : "Пока используется значение из настроек.",
      currentPhase: currentPhase,
      insights: buildInsightCards(cycleLengths, averageCycle, cycleVariation, logsDesc, ovulationDate, fertileStart),
    };
  }

  function buildCalendarHtml(model, monthInfo) {
    var today = todayISO();
    var html = [];
    monthInfo.days.forEach(function (day) {
      var periodType = getPeriodType(day.iso, model.periodsAsc, model.nextPeriodStart, model.nextPeriodEnd);
      var isFertile = isWithinRange(day.iso, model.fertileStart, model.fertileEnd);
      var isOvulation = model.ovulationDate === day.iso;
      var hasLog = hasLogForDate(day.iso);
      var hasSex = hasSymptomForDate(day.iso, "sex");
      var classes = ["day-cell"];
      if (!day.currentMonth) {
        classes.push("muted");
      }
      if (periodType === "actual") {
        classes.push("actual-period");
      }
      if (periodType === "predicted") {
        classes.push("predicted-period");
      }
      if (isFertile) {
        classes.push("fertile-window");
      }
      if (day.iso === today) {
        classes.push("today");
      }
      var tags = [];
      if (periodType === "actual") {
        tags.push('<span class="mini-pill actual">М</span>');
      }
      if (periodType === "predicted") {
        tags.push('<span class="mini-pill predicted">Пр</span>');
      }
      if (isFertile && !isOvulation) {
        tags.push('<span class="mini-pill fertile">Ф</span>');
      }
      if (isOvulation) {
        tags.push('<span class="mini-pill ovulation">О</span>');
      }
      if (hasLog) {
        tags.push('<span class="mini-dot log" aria-label="Есть запись"></span>');
      }
      var cornerIcons = [];
      if (hasSex) {
        cornerIcons.push('<span class="day-sex-mark" aria-hidden="true">&#9829;</span>');
      }
      if (isOvulation) {
        cornerIcons.push('<span class="day-ovulation-mark" aria-hidden="true"></span>');
      }
      html.push(
        '<div class="' +
          classes.join(" ") +
          '" data-date="' +
          escapeHtml(day.iso) +
          '">' +
          (cornerIcons.length ? '<div class="day-corner-icons">' + cornerIcons.join("") + "</div>" : "") +
          '<span class="day-number">' +
          day.day +
          "</span>" +
          '<div class="day-tags">' +
          tags.join("") +
          "</div>" +
          "</div>"
      );
    });
    return html.join("");
  }

  function buildCalendarInsights(model) {
    var cards = [
      {
        title: "Следующая менструация",
        text: model.nextPeriodStart ? formatDateRange(model.nextPeriodStart, model.nextPeriodEnd) : "Нужна первая запись цикла.",
      },
      {
        title: "Фертильное окно",
        text: model.fertileStart ? formatDateRange(model.fertileStart, model.fertileEnd) : "Появится после прогноза.",
      },
      {
        title: "Дневник",
        text: model.logsDesc.length + " " + pluralize(model.logsDesc.length, "запись", "записи", "записей") + " самочувствия.",
      },
    ];
    return cards
      .map(function (card) {
        return (
          '<article class="calendar-insight"><strong>' +
          escapeHtml(card.title) +
          "</strong><span>" +
          escapeHtml(card.text) +
          "</span></article>"
        );
      })
      .join("");
  }

  function buildCycleChart(series, rangeKey) {
    if (series.length < 2) {
      return "Нужно минимум 2 цикла, чтобы построить график.";
    }
    var width = 760;
    var height = 360;
    var padLeft = 54;
    var padRight = 24;
    var padTop = 28;
    var padBottom = 52;
    var values = series.map(function (item) { return item.value; });
    var minValue = Math.max(15, Math.min.apply(null, values) - 2);
    var maxValue = Math.max.apply(null, values) + 2;
    if (minValue === maxValue) {
      maxValue += 4;
      minValue -= 4;
    }
    var points = series.map(function (item, index) {
      var x = padLeft + (index * (width - padLeft - padRight)) / Math.max(1, series.length - 1);
      var y = padTop + ((maxValue - item.value) * (height - padTop - padBottom)) / (maxValue - minValue);
      return { x: x, y: y, item: item };
    });
    var path = points
      .map(function (point, index) {
        return (index === 0 ? "M" : "L") + point.x.toFixed(1) + " " + point.y.toFixed(1);
      })
      .join(" ");
    var grid = [minValue, Math.round((minValue + maxValue) / 2), maxValue]
      .map(function (value) {
        var y = padTop + ((maxValue - value) * (height - padTop - padBottom)) / (maxValue - minValue);
        return (
          '<line class="chart-gridline" x1="' +
          padLeft +
          '" y1="' +
          y +
          '" x2="' +
          (width - padRight) +
          '" y2="' +
          y +
          '"></line><text class="chart-axis" x="6" y="' +
          (y + 4) +
          '">' +
          value +
          "</text>"
        );
      })
      .join("");
    var pointHtml = points
      .map(function (point, index) {
        var label = shouldShowChartLabel(index, points.length)
          ? '<text class="chart-axis" x="' + point.x + '" y="' + (height - 10) + '" text-anchor="middle">' + point.item.label + "</text>"
          : "";
        return (
          '<circle class="chart-point" cx="' +
          point.x +
          '" cy="' +
          point.y +
          '" r="6"></circle>' +
          label
        );
      })
      .join("");
    return (
      '<p class="chart-summary">Период: ' +
      escapeHtml(getChartRangeLabel(rangeKey)) +
      ".</p>" +
      '<svg class="chart-svg" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" role="img" aria-label="График длины циклов">' +
      grid +
      '<path class="chart-line" d="' +
      path +
      '"></path>' +
      pointHtml +
      "</svg>"
    );
  }

  function buildSymptomChart(counts, rangeKey, logCount) {
    var entries = Object.keys(counts)
      .map(function (key) {
        return { key: key, label: getSymptomLabel(key), value: counts[key] };
      })
      .filter(function (entry) {
        return entry.label && entry.value > 0;
      })
      .sort(function (left, right) {
        return right.value - left.value;
      })
      .slice(0, 6);
    if (!entries.length) {
      return logCount ? "За выбранный период нет отмеченных симптомов." : "Добавь несколько записей за дни цикла.";
    }
    var width = 760;
    var rowHeight = 46;
    var height = 42 + entries.length * rowHeight;
    var labelWidth = 230;
    var maxValue = Math.max.apply(
      null,
      entries.map(function (entry) { return entry.value; })
    );
    var bars = entries
      .map(function (entry, index) {
        var y = 26 + index * rowHeight;
        var barWidth = ((width - labelWidth - 70) * entry.value) / maxValue;
        return (
          '<text class="bar-label" x="0" y="' +
          (y + 15) +
          '">' +
          escapeHtml(shorten(entry.label, 24)) +
          "</text>" +
          '<rect class="bar" x="' +
          labelWidth +
          '" y="' +
          y +
          '" width="' +
          barWidth +
          '" height="28" rx="9"></rect>' +
          '<text class="bar-label" x="' +
          (labelWidth + barWidth + 8) +
          '" y="' +
          (y + 20) +
          '">' +
          entry.value +
          "</text>"
        );
      })
      .join("");
    return (
      '<p class="chart-summary">' +
      logCount +
      " " +
      pluralize(logCount, "запись", "записи", "записей") +
      " за " +
      escapeHtml(getChartRangeLabel(rangeKey)) +
      ".</p>" +
      '<svg class="chart-svg" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" role="img" aria-label="Частые симптомы">' +
      bars +
      "</svg>"
    );
  }

  function buildInsightCards(cycleLengths, averageCycle, cycleVariation, logsDesc, ovulationDate, fertileStart) {
    var recentLogs = logsDesc.slice(0, 5);
    var lowWellbeingCount = recentLogs.filter(function (log) { return Number(log.wellbeing) <= 2; }).length;
    var highLibidoCount = recentLogs.filter(function (log) { return Number(log.libido) >= 4; }).length;
    return [
      {
        title: "Стабильность цикла",
        text: cycleLengths.length
          ? cycleVariation <= 3
            ? "Последние циклы довольно ровные, прогноз должен быть ближе к реальности."
            : "Разброс заметный, поэтому прогноз стоит считать ориентиром."
          : "Пока прогноз опирается на базовую длину " + averageCycle + " дней.",
      },
      {
        title: "Самочувствие",
        text:
          lowWellbeingCount > 1
            ? "В недавних записях было несколько тяжёлых дней."
            : "По недавним записям выраженного провала самочувствия не видно.",
      },
      {
        title: "Либидо и фертильность",
        text: ovulationDate
          ? highLibidoCount > 0
            ? "Есть дни с высоким влечением. Сравни их с окном около " + formatPrettyDate(fertileStart) + "."
            : "Фертильное окно начинается около " + formatPrettyDate(fertileStart) + "."
          : "Появится после расчёта следующей овуляции.",
      },
    ];
  }

  function getCurrentPhase(lastPeriod, today, nextPeriodStart, ovulationDate, fertileStart, fertileEnd) {
    if (!lastPeriod) {
      return {
        title: "Нужно больше данных",
        meta: "Добавь хотя бы одну дату начала менструации.",
      };
    }
    if (isWithinRange(today, lastPeriod.startDate, lastPeriod.endDate)) {
      return {
        title: "Менструация",
        meta: "Сейчас отмечен активный период.",
      };
    }
    var dayInCycle = diffDays(lastPeriod.startDate, today) + 1;
    if (isWithinRange(today, fertileStart, fertileEnd)) {
      return {
        title: "Фертильное окно",
        meta: "Примерно день цикла: " + dayInCycle,
      };
    }
    if (ovulationDate && compareIsoDates(today, ovulationDate) < 0) {
      return {
        title: "Фолликулярная фаза",
        meta: "Примерно день цикла: " + dayInCycle,
      };
    }
    if (nextPeriodStart && compareIsoDates(today, nextPeriodStart) < 0) {
      return {
        title: "Лютеиновая фаза",
        meta: "Примерно день цикла: " + dayInCycle,
      };
    }
    return {
      title: "Ожидание следующего цикла",
      meta: "Примерно день цикла: " + Math.max(dayInCycle, 1),
    };
  }

  function getMonthInfo(monthKey) {
    var parts = monthKey.split("-").map(Number);
    var year = parts[0];
    var monthIndex = parts[1] - 1;
    var first = new Date(Date.UTC(year, monthIndex, 1));
    var firstWeekday = (first.getUTCDay() + 6) % 7;
    var start = new Date(Date.UTC(year, monthIndex, 1 - firstWeekday));
    var days = [];
    for (var offset = 0; offset < 42; offset += 1) {
      var date = new Date(start.getTime() + offset * DAY_MS);
      days.push({
        iso: formatIsoDate(date),
        day: date.getUTCDate(),
        currentMonth: date.getUTCMonth() === monthIndex,
      });
    }
    return {
      label: formatMonthLabel(year, monthIndex),
      days: days,
    };
  }

  function getPeriodType(dateIso, periodsAsc, nextPeriodStart, nextPeriodEnd) {
    var isActual = periodsAsc.some(function (period) {
      return isWithinRange(dateIso, period.startDate, period.endDate);
    });
    if (isActual) {
      return "actual";
    }
    if (nextPeriodStart && isWithinRange(dateIso, nextPeriodStart, nextPeriodEnd)) {
      return "predicted";
    }
    return "";
  }

  function getPeriodsSortedAsc() {
    return Object.keys(state.periods)
      .map(function (id) {
        return state.periods[id];
      })
      .filter(function (record) {
        return record && record.startDate && record.endDate;
      })
      .sort(function (left, right) {
        return compareIsoDates(left.startDate, right.startDate);
      });
  }

  function getPeriodsSortedDesc() {
    return getPeriodsSortedAsc().slice().reverse();
  }

  function getLogsSortedDesc() {
    return Object.keys(state.logs)
      .map(function (id) {
        return state.logs[id];
      })
      .filter(function (record) {
        return record && record.date;
      })
      .sort(function (left, right) {
        return compareIsoDates(right.date, left.date);
      });
  }

  function getPeriodYearKeys(periods) {
    var yearSet = { all: true };
    periods.forEach(function (period) {
      yearSet[period.startDate.slice(0, 4)] = true;
    });
    return Object.keys(yearSet).sort(function (left, right) {
      if (left === "all") {
        return -1;
      }
      if (right === "all") {
        return 1;
      }
      return compareIsoDates(right + "-01-01", left + "-01-01");
    });
  }

  function renderPeriodYearOptions(yearKeys) {
    elements.periodYearFilter.innerHTML = yearKeys
      .map(function (yearKey) {
        return '<option value="' + escapeHtml(yearKey) + '">' + escapeHtml(yearKey === "all" ? "Все годы" : yearKey) + "</option>";
      })
      .join("");
    elements.periodYearFilter.value = uiState.periodYearFilter;
  }

  function getLogMonthKeys(logs) {
    var monthSet = {};
    logs.forEach(function (log) {
      monthSet[log.date.slice(0, 7)] = true;
    });
    return Object.keys(monthSet).sort(function (left, right) {
      return compareIsoDates(right + "-01", left + "-01");
    });
  }

  function renderLogMonthOptions(monthKeys) {
    elements.logMonthFilter.innerHTML = ['<option value="all">Все месяцы</option>']
      .concat(
        monthKeys.map(function (monthKey) {
          return '<option value="' + escapeHtml(monthKey) + '">' + escapeHtml(formatMonthKey(monthKey)) + "</option>";
        })
      )
      .join("");
    elements.logMonthFilter.value = uiState.logFilter;
  }

  function getPeriodCycleLengths(periodsDesc) {
    var cycleLengths = {};
    periodsDesc.forEach(function (period, index) {
      var nextOlder = periodsDesc[index + 1];
      cycleLengths[period.id] = nextOlder ? diffDays(nextOlder.startDate, period.startDate) : null;
    });
    return cycleLengths;
  }

  function updatePeriodSummary(totalCount, shownCount) {
    var label = uiState.periodYearFilter === "all" ? "за всё время" : "за " + uiState.periodYearFilter + " год";
    elements.periodSummaryMeta.textContent =
      "Сейчас " +
      shownCount +
      " " +
      pluralize(shownCount, "цикл", "цикла", "циклов") +
      " " +
      label +
      ". Всего: " +
      totalCount +
      ".";
    elements.periodSummaryAction.textContent = elements.periodPanel.open ? "Свернуть" : "Развернуть";
  }

  function updateLogSummary(totalCount, shownCount) {
    var label = uiState.logFilter === "all" ? "за всё время" : "за " + formatMonthKey(uiState.logFilter);
    elements.logSummaryMeta.textContent =
      "Сейчас " +
      shownCount +
      " " +
      pluralize(shownCount, "запись", "записи", "записей") +
      " " +
      label +
      ". Всего: " +
      totalCount +
      ".";
    elements.logSummaryAction.textContent = elements.logPanel.open ? "Свернуть" : "Развернуть";
  }

  function hasLogForDate(dateIso) {
    return getLogsSortedDesc().some(function (log) {
      return log.date === dateIso;
    });
  }

  function hasSymptomForDate(dateIso, symptomKey) {
    return getLogsSortedDesc().some(function (log) {
      return log.date === dateIso && Array.isArray(log.symptoms) && log.symptoms.indexOf(symptomKey) >= 0;
    });
  }

  function countSymptoms(logs) {
    var symptomCounts = {};
    logs.forEach(function (log) {
      (log.symptoms || []).forEach(function (symptom) {
        symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
      });
    });
    return symptomCounts;
  }

  function filterCycleSeriesByRange(series, rangeKey) {
    return series.filter(function (item) {
      return compareIsoDates(item.date, getRangeStartIso(rangeKey)) >= 0;
    });
  }

  function filterLogsByRange(logs, rangeKey) {
    if (rangeKey === "all") {
      return logs.slice();
    }
    return logs.filter(function (log) {
      return compareIsoDates(log.date, getRangeStartIso(rangeKey)) >= 0;
    });
  }

  function syncChartRangeButtons(container, attributeName, activeValue) {
    Array.from(container.querySelectorAll("button[" + attributeName + "]")).forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute(attributeName) === activeValue);
    });
  }

  function onCycleChartRangeClick(event) {
    var button = event.target.closest("[data-cycle-range]");
    if (!button) {
      return;
    }
    uiState.cycleChartRange = button.getAttribute("data-cycle-range") || "6m";
    renderCharts();
  }

  function onSymptomChartRangeClick(event) {
    var button = event.target.closest("[data-symptom-range]");
    if (!button) {
      return;
    }
    uiState.symptomChartRange = button.getAttribute("data-symptom-range") || "6m";
    renderCharts();
  }

  function getSymptomLabel(key) {
    var item = SYMPTOMS.find(function (entry) {
      return entry.key === key;
    });
    return item ? item.label : "";
  }

  function buildBackupFilename(isoString) {
    return "cycle-together-" + isoString.slice(0, 10) + ".cycle-together.json";
  }

  function downloadTextFile(fileName, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function setBackupStatus(message) {
    elements.backupStatus.textContent = message;
  }

  function setInviteStatus(message) {
    elements.inviteStatus.textContent = message || "";
  }

  function rememberLastBackup(isoString) {
    try {
      window.localStorage.setItem(LAST_BACKUP_KEY, isoString);
    } catch (error) {}
    renderLastBackupMeta(isoString);
  }

  function getLastBackupTimestamp() {
    try {
      return window.localStorage.getItem(LAST_BACKUP_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function renderLastBackupMeta(value) {
    if (!elements.lastBackupMeta) {
      return;
    }
    var isoString = value || getLastBackupTimestamp();
    elements.lastBackupMeta.textContent = isoString
      ? "Последний backup: " + formatDateTime(isoString)
      : "Последний backup: ещё не создавался.";
  }

  function createId(prefix) {
    var random = Math.random().toString(36).slice(2, 8);
    return prefix + "-" + Date.now().toString(36) + "-" + random;
  }

  function cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
  }

  function average(values) {
    return (
      values.reduce(function (sum, value) {
        return sum + value;
      }, 0) / values.length
    );
  }

  function todayISO() {
    return formatLocalDate(new Date());
  }

  function compareIsoDates(left, right) {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }

  function diffDays(startIso, endIso) {
    return Math.round((parseIsoDate(endIso) - parseIsoDate(startIso)) / DAY_MS);
  }

  function addDays(isoDate, days) {
    return formatIsoDate(new Date(parseIsoDate(isoDate).getTime() + days * DAY_MS));
  }

  function parseIsoDate(value) {
    var parts = value.split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function formatIsoDate(date) {
    return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join("-");
  }

  function formatLocalDate(date) {
    return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
  }

  function formatPrettyDate(isoDate) {
    if (!isoDate) {
      return "-";
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
    }).format(parseIsoDate(isoDate));
  }

  function formatDateRange(startIso, endIso) {
    if (!startIso || !endIso) {
      return "-";
    }
    if (startIso === endIso) {
      return formatPrettyDate(startIso);
    }
    return formatPrettyDate(startIso) + " - " + formatPrettyDate(endIso);
  }

  function formatMonthLabel(year, monthIndex) {
    return new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(year, monthIndex, 1)));
  }

  function formatMonthKey(monthKey) {
    var parts = monthKey.split("-").map(Number);
    return formatMonthLabel(parts[0], parts[1] - 1);
  }

  function formatChartDateLabel(isoDate) {
    return isoDate ? isoDate.slice(8, 10) + "." + isoDate.slice(5, 7) : "";
  }

  function getChartRangeLabel(rangeKey) {
    if (rangeKey === "12m") {
      return "последние 12 месяцев";
    }
    if (rangeKey === "all") {
      return "всё время";
    }
    return "последние 6 месяцев";
  }

  function getRangeStartIso(rangeKey) {
    var today = parseIsoDate(todayISO());
    var monthsBack = rangeKey === "12m" ? 11 : 5;
    return formatIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1)));
  }

  function formatDateTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "неизвестно";
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function shiftMonth(monthKey, offset) {
    var parts = monthKey.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1);
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function isWithinRange(value, start, end) {
    if (!value || !start || !end) {
      return false;
    }
    return compareIsoDates(value, start) >= 0 && compareIsoDates(value, end) <= 0;
  }

  function shouldShowChartLabel(index, totalCount) {
    if (totalCount <= 6) {
      return true;
    }
    if (totalCount <= 10) {
      return index % 2 === 0 || index === totalCount - 1;
    }
    return index % 3 === 0 || index === totalCount - 1;
  }

  function shorten(text, maxLength) {
    return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
  }

  function pluralize(count, one, few, many) {
    var mod10 = count % 10;
    var mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return one;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return few;
    }
    return many;
  }

  function clampNumber(value, min, max, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeSymptoms(values) {
    var allowed = {};
    SYMPTOMS.forEach(function (item) {
      allowed[item.key] = true;
    });
    return (Array.isArray(values) ? values : [])
      .filter(function (value) {
        return allowed[value];
      })
      .sort();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
