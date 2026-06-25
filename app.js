(function () {
  var APP_ID = "cycle-together";
  var LAST_BACKUP_KEY = "cycle-together.last-backup.v1";
  var DAY_MS = 24 * 60 * 60 * 1000;
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

  var state = {
    settings: {
      cycleLength: 28,
      periodLength: 5,
      lutealLength: 14,
    },
    periods: {},
    logs: {},
    pendingSnapshots: {},
    ready: false,
    lastSerial: 0,
    syncStatus: "Загрузка…",
    syncMeta: "Получаю историю приложения из чата.",
  };

  var uiState = {
    viewMonth: todayISO().slice(0, 7),
    periodYearFilter: "all",
    cycleChartRange: "6m",
    symptomChartRange: "6m",
    logFilter: "all",
  };

  var elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    renderSymptomOptions();
    bindEvents();
    resetPeriodForm();
    resetLogForm();
    syncSettingsForm();
    setupPreviewBanner();
    setupBackupControls();
    setupUpdates();
    render();
  }

  function cacheElements() {
    elements.statsGrid = document.getElementById("statsGrid");
    elements.syncStatus = document.getElementById("syncStatus");
    elements.syncMeta = document.getElementById("syncMeta");
    elements.previewBanner = document.getElementById("previewBanner");
    elements.openPartnerTab = document.getElementById("openPartnerTab");
    elements.clearPreview = document.getElementById("clearPreview");
    elements.calendarMonthLabel = document.getElementById("calendarMonthLabel");
    elements.calendarGrid = document.getElementById("calendarGrid");
    elements.calendarInsights = document.getElementById("calendarInsights");
    elements.periodPanel = document.getElementById("periodPanel");
    elements.periodYearFilter = document.getElementById("periodYearFilter");
    elements.periodSummaryMeta = document.getElementById("periodSummaryMeta");
    elements.periodSummaryAction = document.getElementById("periodSummaryAction");
    elements.periodHistory = document.getElementById("periodHistory");
    elements.logHistory = document.getElementById("logHistory");
    elements.logPanel = document.getElementById("logPanel");
    elements.logMonthFilter = document.getElementById("logMonthFilter");
    elements.logSummaryMeta = document.getElementById("logSummaryMeta");
    elements.logSummaryAction = document.getElementById("logSummaryAction");
    elements.exportBackup = document.getElementById("exportBackup");
    elements.shareBackup = document.getElementById("shareBackup");
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
    elements.periodHistory.addEventListener("click", onPeriodHistoryAction);
    elements.periodPanel.addEventListener("toggle", renderPeriods);
    elements.periodYearFilter.addEventListener("change", function () {
      uiState.periodYearFilter = elements.periodYearFilter.value || "all";
      renderPeriods();
    });
    elements.logHistory.addEventListener("click", onLogHistoryAction);
    elements.logPanel.addEventListener("toggle", renderLogs);
    elements.logMonthFilter.addEventListener("change", function () {
      uiState.logFilter = elements.logMonthFilter.value;
      renderLogs();
    });
    elements.exportBackup.addEventListener("click", onExportBackup);
    elements.shareBackup.addEventListener("click", onShareBackup);
    elements.importBackup.addEventListener("click", onImportBackup);
    elements.backupFileInput.addEventListener("change", onBackupFileSelected);
    elements.cycleChartControls.addEventListener("click", onCycleChartRangeClick);
    elements.symptomChartControls.addEventListener("click", onSymptomChartRangeClick);
  }

  function setupBackupControls() {
    if (window.webxdc && typeof window.webxdc.sendToChat === "function") {
      elements.shareBackup.classList.remove("hidden");
    }
    renderLastBackupMeta();
  }

  function setupPreviewBanner() {
    if (!window.webxdc || !window.webxdc.__mock) {
      return;
    }

    elements.previewBanner.classList.remove("hidden");
    elements.openPartnerTab.addEventListener("click", function () {
      var url = window.location.href.split("?")[0] + "?name=Партнер";
      window.open(url, "_blank");
    });
    elements.clearPreview.addEventListener("click", function () {
      if (!window.confirm("Очистить локальные данные предпросмотра?")) {
        return;
      }
      window.webxdc.__clearPreviewData();
      window.location.reload();
    });
  }

  function renderSymptomOptions() {
    elements.symptomList.innerHTML = SYMPTOMS.map(function (symptom) {
      return (
        '<label class="symptom-chip">' +
        '<input type="checkbox" value="' +
        symptom.key +
        '" />' +
        "<span>" +
        symptom.label +
        "</span>" +
        "</label>"
      );
    }).join("");
  }

  function setupUpdates() {
    if (!window.webxdc || typeof window.webxdc.setUpdateListener !== "function") {
      state.syncStatus = "webxdc API не найдена";
      state.syncMeta = "Открой приложение в браузере или внутри совместимого чата.";
      render();
      return;
    }

    window.webxdc
      .setUpdateListener(function (update) {
        applyUpdate(update);
      }, 0)
      .then(function () {
        state.ready = true;
        state.syncStatus = "История загружена";
        state.syncMeta = state.lastSerial
          ? "Все общие изменения из чата уже применены."
          : "Это новый календарь. Можно вносить первые данные.";
        render();
      });
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

    sendAppUpdate({
      type: "upsert_period",
      mode: existingId && state.periods[existingId] && !state.periods[existingId].deleted ? "edit" : "create",
      record: {
        id: existingId || createId("period"),
        startDate: startDate,
        endDate: endDate,
        flow: elements.periodFlow.value,
        note: elements.periodNote.value.trim(),
        authorName: getSelfName(),
        authorAddr: getSelfAddr(),
        updatedAt: new Date().toISOString(),
      },
    });

    resetPeriodForm();
  }

  function onLogSubmit(event) {
    event.preventDefault();
    var logDate = elements.logDate.value;
    var existingId = elements.logId.value;

    if (!logDate) {
      window.alert("Выбери дату для записи.");
      return;
    }

    sendAppUpdate({
      type: "upsert_log",
      mode: existingId && state.logs[existingId] && !state.logs[existingId].deleted ? "edit" : "create",
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
        authorName: getSelfName(),
        authorAddr: getSelfAddr(),
        updatedAt: new Date().toISOString(),
      },
    });

    resetLogForm();
  }

  function onSettingsSubmit(event) {
    event.preventDefault();
    var cycleLength = Number(elements.cycleLengthSetting.value);
    var periodLength = Number(elements.periodLengthSetting.value);
    var lutealLength = Number(elements.lutealLengthSetting.value);

    if (!cycleLength || !periodLength || !lutealLength) {
      window.alert("Заполни все настройки прогноза.");
      return;
    }

    sendAppUpdate({
      type: "update_settings",
      settings: {
        cycleLength: cycleLength,
        periodLength: periodLength,
        lutealLength: lutealLength,
        updatedBy: getSelfName(),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function onPeriodHistoryAction(event) {
    var actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }

    var id = actionButton.getAttribute("data-id");
    var record = state.periods[id];
    if (!record || record.deleted) {
      return;
    }

    if (actionButton.getAttribute("data-action") === "edit-period") {
      loadPeriodForEdit(record);
      return;
    }

    if (window.confirm("Удалить эту запись цикла?")) {
      sendAppUpdate({
        type: "delete_period",
        id: id,
      });
      resetPeriodForm();
    }
  }

  function onLogHistoryAction(event) {
    var actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }

    var id = actionButton.getAttribute("data-id");
    var record = state.logs[id];
    if (!record || record.deleted) {
      return;
    }

    if (actionButton.getAttribute("data-action") === "edit-log") {
      loadLogForEdit(record);
      return;
    }

    if (window.confirm("Удалить эту запись дня?")) {
      sendAppUpdate({
        type: "delete_log",
        id: id,
      });
      resetLogForm();
    }
  }

  function onExportBackup() {
    try {
      var snapshot = buildExportSnapshot();
      var fileName = buildBackupFilename(snapshot.exportedAt);
      downloadTextFile(fileName, JSON.stringify(snapshot, null, 2), "application/json");
      rememberLastBackup(snapshot.exportedAt);
      setBackupStatus("Файл " + fileName + " подготовлен для сохранения на устройство.");
    } catch (error) {
      console.error(error);
      setBackupStatus("Не удалось создать файл резервной копии.");
      window.alert("Не удалось экспортировать данные календаря.");
    }
  }

  function onShareBackup() {
    if (!window.webxdc || typeof window.webxdc.sendToChat !== "function") {
      setBackupStatus("В этом режиме нельзя отправить backup в чат, но можно экспортировать файл.");
      return;
    }

    try {
      var snapshot = buildExportSnapshot();
      var fileName = buildBackupFilename(snapshot.exportedAt);
      setBackupStatus("Подготавливаю backup для отправки в чат…");
      window.webxdc
        .sendToChat({
          file: {
            name: fileName,
            plainText: JSON.stringify(snapshot, null, 2),
          },
          text: "Резервная копия календаря Cycle Together",
        })
        .then(function () {
          rememberLastBackup(snapshot.exportedAt);
          setBackupStatus("Backup передан в форму отправки чата.");
        })
        .catch(function (error) {
          console.error(error);
          setBackupStatus("Не удалось передать backup в чат.");
        });
    } catch (error) {
      console.error(error);
      setBackupStatus("Не удалось подготовить backup для чата.");
    }
  }

  function onImportBackup() {
    if (window.webxdc && typeof window.webxdc.importFiles === "function") {
      window.webxdc
        .importFiles({
          extensions: [".json", ".cycle-together.json"],
          mimeTypes: ["application/json", "text/json"],
        })
        .then(function (files) {
          if (files && files[0]) {
            importBackupFile(files[0]);
          }
        })
        .catch(function (error) {
          console.error(error);
          setBackupStatus("Не удалось открыть выбор файла для импорта.");
        });
      return;
    }

    elements.backupFileInput.value = "";
    elements.backupFileInput.click();
  }

  function onBackupFileSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    importBackupFile(file);
    elements.backupFileInput.value = "";
  }

  function importBackupFile(file) {
    file
      .text()
      .then(function (text) {
        var snapshot = parseBackupText(text);
        var message =
          "Импорт заменит текущие данные этого календаря во всём чате. Продолжить?\n\n" +
          "Циклы: " +
          snapshot.periods.length +
          "\nЗаписи: " +
          snapshot.logs.length;

        if (!window.confirm(message)) {
          return;
        }

        setBackupStatus("Импортирую резервную копию…");
        importBackupSnapshot(snapshot);
        setBackupStatus("Резервная копия отправлена в общий календарь. Дождись синхронизации.");
      })
      .catch(function (error) {
        console.error(error);
        setBackupStatus("Файл не удалось импортировать. Проверь, что это backup Cycle Together.");
        window.alert("Не удалось импортировать файл резервной копии.");
      });
  }

  function buildExportSnapshot() {
    return {
      app: APP_ID,
      type: "cycle-together-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        name: getSelfName(),
        addr: getSelfAddr(),
      },
      settings: {
        cycleLength: Number(state.settings.cycleLength || 28),
        periodLength: Number(state.settings.periodLength || 5),
        lutealLength: Number(state.settings.lutealLength || 14),
      },
      periods: getPeriodsSortedAsc().map(function (record) {
        return cloneRecord(record);
      }),
      logs: getLogsSortedDesc()
        .slice()
        .reverse()
        .map(function (record) {
          return cloneRecord(record);
        }),
    };
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
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function parseBackupText(text) {
    var raw = JSON.parse(text);
    if (!raw || raw.app !== APP_ID || raw.type !== "cycle-together-backup") {
      throw new Error("Unsupported backup file");
    }
    return normalizeSnapshot(raw);
  }

  function importBackupSnapshot(snapshot) {
    var normalized = normalizeSnapshot(snapshot);
    var rawSnapshot = {
      settings: normalized.settings,
      periods: normalized.periods,
      logs: normalized.logs,
    };
    var singleUpdate = {
      type: "replace_state",
      snapshot: rawSnapshot,
    };

    if (getSerializedSize(singleUpdate) <= getSafeUpdateBudget()) {
      sendAppUpdate(singleUpdate);
      return;
    }

    var importId = createId("backup");
    var serialized = JSON.stringify(rawSnapshot);
    var chunkSize = Math.max(4000, Math.floor(getSafeUpdateBudget() * 0.25));
    var chunks = [];

    for (var start = 0; start < serialized.length; start += chunkSize) {
      chunks.push(serialized.slice(start, start + chunkSize));
    }

    sendAppUpdate({
      type: "replace_state_begin",
      importId: importId,
      totalChunks: chunks.length,
    });

    chunks.forEach(function (chunk, index) {
      sendAppUpdate(
        {
          type: "replace_state_chunk",
          importId: importId,
          index: index,
          totalChunks: chunks.length,
          chunk: chunk,
        },
        {
          skipInfo: true,
          skipSummary: true,
          skipHref: true,
          skipStatus: true,
        }
      );
    });

    sendAppUpdate(
      {
        type: "replace_state_end",
        importId: importId,
      },
      {
        skipInfo: true,
        skipSummary: true,
        skipHref: true,
        skipStatus: true,
      }
    );
  }

  function normalizeSnapshot(raw) {
    var settings = raw.settings || {};
    return {
      settings: {
        cycleLength: clampNumber(settings.cycleLength, 20, 45, 28),
        periodLength: clampNumber(settings.periodLength, 2, 10, 5),
        lutealLength: clampNumber(settings.lutealLength, 10, 18, 14),
      },
      periods: normalizePeriodRecords(raw.periods || []),
      logs: normalizeLogRecords(raw.logs || []),
    };
  }

  function normalizePeriodRecords(records) {
    var seen = {};
    return records
      .map(function (record, index) {
        if (!record || !record.startDate || !record.endDate) {
          return null;
        }
        var id = record.id || "period-import-" + index;
        if (seen[id]) {
          id = id + "-" + index;
        }
        seen[id] = true;
        return {
          id: id,
          startDate: record.startDate,
          endDate: record.endDate,
          flow: FLOW_LABELS[record.flow] ? record.flow : "medium",
          note: String(record.note || ""),
          authorName: String(record.authorName || getSelfName()),
          authorAddr: String(record.authorAddr || getSelfAddr()),
          updatedAt: record.updatedAt || new Date().toISOString(),
          deleted: false,
        };
      })
      .filter(Boolean)
      .sort(function (left, right) {
        return compareIsoDates(left.startDate, right.startDate);
      });
  }

  function normalizeLogRecords(records) {
    var seen = {};
    return records
      .map(function (record, index) {
        if (!record || !record.date) {
          return null;
        }
        var id = record.id || "log-import-" + index;
        if (seen[id]) {
          id = id + "-" + index;
        }
        seen[id] = true;
        return {
          id: id,
          date: record.date,
          wellbeing: clampNumber(record.wellbeing, 1, 5, 3),
          energy: clampNumber(record.energy, 1, 5, 3),
          mood: clampNumber(record.mood, 1, 5, 3),
          libido: clampNumber(record.libido, 1, 5, 3),
          pain: clampNumber(record.pain, 0, 5, 3),
          symptoms: normalizeSymptoms(record.symptoms || []),
          note: String(record.note || ""),
          authorName: String(record.authorName || getSelfName()),
          authorAddr: String(record.authorAddr || getSelfAddr()),
          updatedAt: record.updatedAt || new Date().toISOString(),
          deleted: false,
        };
      })
      .filter(Boolean)
      .sort(function (left, right) {
        return compareIsoDates(left.date, right.date);
      });
  }

  function applySnapshot(snapshot) {
    var normalized = normalizeSnapshot(snapshot);
    state.settings = Object.assign({}, state.settings, normalized.settings);
    state.periods = {};
    state.logs = {};

    normalized.periods.forEach(function (record) {
      state.periods[record.id] = cloneRecord(record);
    });
    normalized.logs.forEach(function (record) {
      state.logs[record.id] = cloneRecord(record);
    });

    syncSettingsForm();
    resetPeriodForm();
    resetLogForm();
  }

  function tryApplyPendingSnapshot(importId, force) {
    var pending = state.pendingSnapshots[importId];
    if (!pending || !pending.totalChunks) {
      return;
    }

    var complete = pending.chunks.filter(function (item) {
      return typeof item === "string";
    }).length === pending.totalChunks;

    if (!complete && !force) {
      return;
    }

    if (!complete) {
      return;
    }

    try {
      applySnapshot(JSON.parse(pending.chunks.join("")));
      delete state.pendingSnapshots[importId];
    } catch (error) {
      console.error(error);
    }
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

  function setBackupStatus(message) {
    if (elements.backupStatus) {
      elements.backupStatus.textContent = message;
    }
  }

  function rememberLastBackup(isoString) {
    try {
      window.localStorage.setItem(LAST_BACKUP_KEY, isoString);
    } catch (error) {
      // Ignore storage failures and still update the current UI.
    }
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

  function sendAppUpdate(payload, options) {
    options = options || {};

    if (!window.webxdc || typeof window.webxdc.sendUpdate !== "function") {
      window.alert("Не удалось отправить обновление: webxdc API недоступна.");
      return;
    }

    if (!options.skipStatus) {
      state.syncStatus = "Отправляю изменение…";
      state.syncMeta = "После доставки оно станет общим для всех участников этого чата.";
      renderSyncStatus();
    }

    var info = options.skipInfo ? "" : buildInfoLabel(payload);
    var summary = options.skipSummary ? "" : buildSummaryLabel(payload);
    var href = options.skipHref ? "" : buildUpdateHref(payload);
    var update = {
      payload: {
        app: APP_ID,
        payload: payload,
      },
    };

    if (summary) {
      update.summary = summary;
    }
    if (info) {
      update.info = info;
    }
    if (href) {
      update.href = href;
    }

    window.webxdc.sendUpdate(update, "");
  }

  function applyUpdate(update) {
    if (!update || !update.payload || update.payload.app !== APP_ID) {
      return;
    }

    var payload = update.payload.payload || {};
    state.lastSerial = Math.max(state.lastSerial, update.serial || 0);

    if (payload.type === "update_settings" && payload.settings) {
      state.settings = Object.assign({}, state.settings, payload.settings);
      syncSettingsForm();
    }

    if (payload.type === "upsert_period" && payload.record && payload.record.id) {
      state.periods[payload.record.id] = Object.assign({}, payload.record, {
        deleted: false,
      });
    }

    if (payload.type === "delete_period" && payload.id) {
      state.periods[payload.id] = Object.assign({}, state.periods[payload.id], {
        id: payload.id,
        deleted: true,
      });
    }

    if (payload.type === "upsert_log" && payload.record && payload.record.id) {
      state.logs[payload.record.id] = Object.assign({}, payload.record, {
        deleted: false,
      });
    }

    if (payload.type === "delete_log" && payload.id) {
      state.logs[payload.id] = Object.assign({}, state.logs[payload.id], {
        id: payload.id,
        deleted: true,
      });
    }

    if (payload.type === "replace_state" && payload.snapshot) {
      applySnapshot(payload.snapshot);
    }

    if (payload.type === "replace_state_begin" && payload.importId) {
      state.pendingSnapshots[payload.importId] = {
        totalChunks: Number(payload.totalChunks) || 0,
        chunks: [],
      };
    }

    if (payload.type === "replace_state_chunk" && payload.importId) {
      if (!state.pendingSnapshots[payload.importId]) {
        state.pendingSnapshots[payload.importId] = {
          totalChunks: Number(payload.totalChunks) || 0,
          chunks: [],
        };
      }
      state.pendingSnapshots[payload.importId].chunks[payload.index] = payload.chunk || "";
      if (payload.totalChunks) {
        state.pendingSnapshots[payload.importId].totalChunks = Number(payload.totalChunks) || 0;
      }
      tryApplyPendingSnapshot(payload.importId);
    }

    if (payload.type === "replace_state_end" && payload.importId) {
      tryApplyPendingSnapshot(payload.importId, true);
    }

    state.syncStatus = state.ready ? "Синхронизировано" : "Загружаю историю…";
    state.syncMeta =
      (update.max_serial || 0) > (update.serial || 0)
        ? "Получаю следующие изменения из чата."
        : "Последнее изменение уже видно всем участникам, у кого открыт этот календарь.";
    render();
  }

  function render() {
    renderSyncStatus();
    renderStats();
    renderCalendar();
    renderPeriods();
    renderLogs();
    renderCharts();
    renderInsights();
  }

  function renderSyncStatus() {
    elements.syncStatus.textContent = state.syncStatus;
    elements.syncMeta.textContent = state.syncMeta;
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
      elements.periodHistory.textContent =
        "За " + uiState.periodYearFilter + " год пока нет записей о менструации.";
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
          '<div>' +
          '<p class="record-title">' +
          escapeHtml(formatPrettyDate(period.startDate)) +
          " - " +
          escapeHtml(formatPrettyDate(period.endDate)) +
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
          (cycleLength
            ? '<span class="tag sage">Цикл: ' + cycleLength + " дн.</span>"
            : "") +
          "</div>" +
          (period.note
            ? '<p class="record-note">' + escapeHtml(period.note) + "</p>"
            : "") +
          '<p class="record-author">Изменил(а): ' +
          escapeHtml(period.authorName || "участник чата") +
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
          '<div>' +
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
          escapeHtml(log.authorName || "участник чата") +
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
    var cycleLabels = [];
    var cycleSeries = [];
    var durationValues = periodsAsc.map(function (period) {
      return diffDays(period.startDate, period.endDate) + 1;
    });

    for (var index = 1; index < periodsAsc.length; index += 1) {
      var cycleDate = periodsAsc[index].startDate;
      var cycleLength = diffDays(periodsAsc[index - 1].startDate, cycleDate);
      cycleLengths.push(cycleLength);
      cycleLabels.push(cycleDate.slice(5));
      cycleSeries.push({
        date: cycleDate,
        value: cycleLength,
        label: formatChartDateLabel(cycleDate),
      });
    }

    var recentCycleLengths = cycleLengths.slice(-6);
    var averageCycle = recentCycleLengths.length
      ? Math.round(average(recentCycleLengths))
      : state.settings.cycleLength;
    var recentDurations = durationValues.slice(-6);
    var averageDuration = recentDurations.length
      ? Math.max(1, Math.round(average(recentDurations)))
      : state.settings.periodLength;
    var lastPeriod = periodsAsc.length ? periodsAsc[periodsAsc.length - 1] : null;
    var nextPeriodStart = lastPeriod ? addDays(lastPeriod.startDate, averageCycle) : "";
    var nextPeriodEnd = nextPeriodStart ? addDays(nextPeriodStart, averageDuration - 1) : "";
    var ovulationDate = nextPeriodStart
      ? addDays(nextPeriodStart, -Number(state.settings.lutealLength || 14))
      : "";
    var fertileStart = ovulationDate ? addDays(ovulationDate, -5) : "";
    var fertileEnd = ovulationDate ? addDays(ovulationDate, 1) : "";
    var cycleVariation = recentCycleLengths.length
      ? Math.max.apply(null, recentCycleLengths) - Math.min.apply(null, recentCycleLengths)
      : 0;

    var symptomCounts = countSymptoms(logsDesc);

    var today = todayISO();
    var currentPhase = getCurrentPhase(lastPeriod, today, nextPeriodStart, ovulationDate, fertileStart, fertileEnd);

    return {
      periodsAsc: periodsAsc,
      periodsDesc: periodsAsc.slice().reverse(),
      logsDesc: logsDesc,
      cycleLengths: cycleLengths,
      cycleLabels: cycleLabels,
      cycleSeries: cycleSeries,
      averageCycle: averageCycle,
      averageDuration: averageDuration,
      cycleVariation: cycleVariation,
      nextPeriodStart: nextPeriodStart,
      nextPeriodEnd: nextPeriodEnd,
      nextPeriodMeta: nextPeriodStart
        ? "Окно: " + formatDateRange(nextPeriodStart, nextPeriodEnd)
        : "Добавь хотя бы одну менструацию и настрой базовую длину цикла.",
      ovulationDate: ovulationDate,
      fertileStart: fertileStart,
      fertileEnd: fertileEnd,
      ovulationMeta: ovulationDate
        ? "Фертильное окно: " + formatDateRange(fertileStart, fertileEnd)
        : "Овуляция будет рассчитана после появления опорных дат.",
      averageCycleMeta:
        cycleLengths.length > 0
          ? "Разброс последних циклов: " + cycleVariation + " дн."
          : "Пока используется базовое значение из настроек.",
      currentPhase: currentPhase,
      symptomCounts: symptomCounts,
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
    var periodsCount = model.periodsAsc.length;
    var logsCount = model.logsDesc.length;
    return [
      {
        title: "Собрано данных",
        text: periodsCount
          ? periodsCount + " циклов и " + logsCount + " дневных записей"
          : "Начни с добавления хотя бы одного цикла.",
      },
      {
        title: "Оба участника",
        text: state.ready
          ? "Любой участник чата может менять одни и те же записи, календарь общий."
          : "Сначала дождись полной загрузки истории приложения.",
      },
      {
        title: "Следующий ориентир",
        text: model.nextPeriodStart
          ? "Ориентир по следующей менструации: " + formatPrettyDate(model.nextPeriodStart)
          : "Пока прогноз строится по базовым настройкам.",
      },
    ]
      .map(function (item) {
        return (
          '<article class="calendar-insight">' +
          "<strong>" +
          escapeHtml(item.title) +
          "</strong>" +
          "<span>" +
          escapeHtml(item.text) +
          "</span>" +
          "</article>"
        );
      })
      .join("");
  }

  function buildCycleChart(series, rangeKey) {
    if (!series.length) {
      return "За " + getChartRangeLabel(rangeKey) + " пока недостаточно данных для графика.";
    }

    if (series.length < 2) {
      return "За " + getChartRangeLabel(rangeKey) + " нужен минимум 2 цикла, чтобы построить график.";
    }

    var width = 420;
    var height = 220;
    var padding = { top: 20, right: 20, bottom: 34, left: 34 };
    var numericValues = series.map(function (item) {
      return item.value;
    });
    var maxValue = Math.max.apply(null, numericValues) + 2;
    var minValue = Math.max(15, Math.min.apply(null, numericValues) - 2);
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var points = series.map(function (item, index) {
      var x = padding.left + (chartWidth * index) / Math.max(series.length - 1, 1);
      var y =
        padding.top +
        chartHeight -
        ((item.value - minValue) / Math.max(maxValue - minValue, 1)) * chartHeight;
      return { x: x, y: y, value: item.value, label: item.label || String(index + 1) };
    });

    var gridLines = [0, 0.5, 1].map(function (ratio) {
      var y = padding.top + chartHeight * ratio;
      var value = Math.round(maxValue - (maxValue - minValue) * ratio);
      return (
        '<line class="chart-gridline" x1="' +
        padding.left +
        '" y1="' +
        y +
        '" x2="' +
        (width - padding.right) +
        '" y2="' +
        y +
        '"></line>' +
        '<text class="chart-axis" x="4" y="' +
        (y + 4) +
        '">' +
        value +
        "</text>"
      );
    });

    var path = points
      .map(function (point, index) {
        return (index === 0 ? "M" : "L") + point.x + " " + point.y;
      })
      .join(" ");

    return (
      '<p class="chart-summary">Период: ' +
      escapeHtml(getChartRangeLabel(rangeKey)) +
      ". На графике " +
      series.length +
      " " +
      pluralize(series.length, "цикл", "цикла", "циклов") +
      ".</p>" +
      '<svg class="chart-svg" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" role="img" aria-label="График длины цикла">' +
      gridLines.join("") +
      '<path class="chart-line" d="' +
      path +
      '"></path>' +
      points
        .map(function (point, index) {
          var showLabel = shouldShowChartLabel(index, points.length);
          return (
            '<circle class="chart-point" cx="' +
            point.x +
            '" cy="' +
            point.y +
            '" r="4"></circle>' +
            '<text class="chart-axis" x="' +
            point.x +
            '" y="' +
            (height - 10) +
            '" text-anchor="middle">' +
            (showLabel ? escapeHtml(point.label) : "") +
            "</text>" +
            '<text class="chart-axis" x="' +
            point.x +
            '" y="' +
            (point.y - 10) +
            '" text-anchor="middle">' +
            point.value +
            "</text>"
          );
        })
        .join("") +
      "</svg>"
    );
  }

  function buildSymptomChart(symptomCounts, rangeKey, logCount) {
    var topSymptoms = Object.keys(symptomCounts)
      .map(function (key) {
        return { key: key, count: symptomCounts[key], label: getSymptomLabel(key) };
      })
      .filter(function (item) {
        return item.label;
      })
      .sort(function (left, right) {
        return right.count - left.count;
      })
      .slice(0, 6);

    if (!topSymptoms.length) {
      return "За " + getChartRangeLabel(rangeKey) + " пока нет отмеченных симптомов.";
    }

    var width = 420;
    var height = 220;
    var padding = { top: 16, right: 16, bottom: 46, left: 28 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var maxValue = Math.max.apply(null, topSymptoms.map(function (item) {
      return item.count;
    }));
    var barWidth = chartWidth / topSymptoms.length - 12;

    return (
      '<p class="chart-summary">Период: ' +
      escapeHtml(getChartRangeLabel(rangeKey)) +
      ". Учтено записей: " +
      logCount +
      ".</p>" +
      '<svg class="chart-svg" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" role="img" aria-label="График симптомов">' +
      topSymptoms
        .map(function (item, index) {
          var ratio = item.count / Math.max(maxValue, 1);
          var barHeight = Math.max(16, ratio * chartHeight);
          var x = padding.left + index * (barWidth + 12);
          var y = padding.top + chartHeight - barHeight;
          return (
            '<rect class="bar" x="' +
            x +
            '" y="' +
            y +
            '" width="' +
            barWidth +
            '" height="' +
            barHeight +
            '" rx="10" ry="10"></rect>' +
            '<text class="chart-axis" x="' +
            (x + barWidth / 2) +
            '" y="' +
            (y - 8) +
            '" text-anchor="middle">' +
            item.count +
            "</text>" +
            '<text class="bar-label" x="' +
            (x + barWidth / 2) +
            '" y="' +
            (height - 18) +
            '" text-anchor="middle">' +
            escapeHtml(shorten(item.label, 10)) +
            "</text>"
          );
        })
        .join("") +
      "</svg>"
    );
  }

  function filterCycleSeriesByRange(cycleSeries, rangeKey) {
    if (rangeKey === "all") {
      return cycleSeries.slice();
    }
    return cycleSeries.filter(function (item) {
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

  function countSymptoms(logs) {
    var symptomCounts = {};
    logs.forEach(function (log) {
      (log.symptoms || []).forEach(function (symptom) {
        symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
      });
    });
    return symptomCounts;
  }

  function syncChartRangeButtons(container, attributeName, activeValue) {
    Array.from(container.querySelectorAll("button[" + attributeName + "]")).forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute(attributeName) === activeValue);
    });
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

  function buildInsightCards(cycleLengths, averageCycle, cycleVariation, logsDesc, ovulationDate, fertileStart) {
    var recentLogs = logsDesc.slice(0, 5);
    var lowWellbeingCount = recentLogs.filter(function (log) {
      return Number(log.wellbeing) <= 2;
    }).length;
    var highLibidoCount = recentLogs.filter(function (log) {
      return Number(log.libido) >= 4;
    }).length;

    return [
      {
        title: "Стабильность цикла",
        text: cycleLengths.length
          ? cycleVariation <= 3
            ? "Последние циклы довольно ровные, прогноз должен быть ближе к реальности."
            : "Разброс в длине цикла заметный, поэтому прогноз стоит считать ориентиром."
          : "Пока прогноз опирается на базовую длину " + averageCycle + " дней.",
      },
      {
        title: "Самочувствие",
        text:
          lowWellbeingCount > 1
            ? "В последних записях было несколько дней с тяжёлым самочувствием. Это стоит отслеживать отдельно."
            : "По недавним записям выраженного провала самочувствия не видно.",
      },
      {
        title: "Либидо и фертильность",
        text: ovulationDate
          ? highLibidoCount > 0
            ? "В недавних записях уже были дни с высоким влечением. Сравни их с окном около " +
              formatPrettyDate(fertileStart) +
              "."
            : "Окно вероятной фертильности начинается около " + formatPrettyDate(fertileStart) + "."
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

  function getPeriodsSortedAsc() {
    return Object.keys(state.periods)
      .map(function (id) {
        return state.periods[id];
      })
      .filter(function (record) {
        return record && !record.deleted && record.startDate && record.endDate;
      })
      .sort(function (left, right) {
        return compareIsoDates(left.startDate, right.startDate);
      });
  }

  function getPeriodsSortedDesc() {
    return getPeriodsSortedAsc().slice().reverse();
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

  function getPeriodCycleLengths(periods) {
    var cycleLengths = {};
    periods.forEach(function (period, index) {
      var nextOlder = periods[index + 1];
      cycleLengths[period.id] = nextOlder ? diffDays(nextOlder.startDate, period.startDate) : null;
    });
    return cycleLengths;
  }

  function getLogsSortedDesc() {
    return Object.keys(state.logs)
      .map(function (id) {
        return state.logs[id];
      })
      .filter(function (record) {
        return record && !record.deleted && record.date;
      })
      .sort(function (left, right) {
        return compareIsoDates(right.date, left.date);
      });
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
    var options = ['<option value="all">Все месяцы</option>']
      .concat(
        monthKeys.map(function (monthKey) {
          return (
            '<option value="' +
            escapeHtml(monthKey) +
            '">' +
            escapeHtml(formatMonthKey(monthKey)) +
            "</option>"
          );
        })
      )
      .join("");
    elements.logMonthFilter.innerHTML = options;
    elements.logMonthFilter.value = uiState.logFilter;
  }

  function renderPeriodYearOptions(yearKeys) {
    var options = yearKeys
      .map(function (yearKey) {
        return (
          '<option value="' +
          escapeHtml(yearKey) +
          '">' +
          escapeHtml(yearKey === "all" ? "Все годы" : yearKey) +
          "</option>"
        );
      })
      .join("");
    elements.periodYearFilter.innerHTML = options;
    elements.periodYearFilter.value = uiState.periodYearFilter;
  }

  function updatePeriodSummary(totalCount, shownCount) {
    var label =
      uiState.periodYearFilter === "all" ? "за всё время" : "за " + uiState.periodYearFilter + " год";

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
    var label =
      uiState.logFilter === "all"
        ? "за всё время"
        : "за " + formatMonthKey(uiState.logFilter);

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

  function getSelfName() {
    return window.webxdc && window.webxdc.selfName ? window.webxdc.selfName : "Участник";
  }

  function getSelfAddr() {
    return window.webxdc && window.webxdc.selfAddr ? window.webxdc.selfAddr : "local";
  }

  function buildSummaryLabel(payload) {
    if (payload.type === "upsert_period") {
      return "Обновлён цикл";
    }
    if (payload.type === "upsert_log") {
      return "Обновлена запись";
    }
    if (payload.type === "update_settings") {
      return "Настройки изменены";
    }
    if (payload.type === "replace_state" || payload.type === "replace_state_begin") {
      return "Импортированы данные";
    }
    return "Календарь обновлён";
  }

  function buildInfoLabel(payload) {
    var actor = shorten(getSelfName(), 18);

    if (payload.type === "upsert_period" && payload.record) {
      return shorten(
        actor +
          " " +
          (payload.mode === "edit" ? "обновил(а) цикл" : "добавил(а) цикл") +
          " " +
          formatPrettyDate(payload.record.startDate),
        72
      );
    }

    if (payload.type === "delete_period") {
      return shorten(actor + " удалил(а) цикл", 72);
    }

    if (payload.type === "upsert_log" && payload.record) {
      return shorten(
        actor +
          " " +
          (payload.mode === "edit" ? "обновил(а) запись" : "добавил(а) запись") +
          " " +
          formatPrettyDate(payload.record.date),
        72
      );
    }

    if (payload.type === "delete_log") {
      return shorten(actor + " удалил(а) запись", 72);
    }

    if (payload.type === "update_settings") {
      return shorten(actor + " обновил(а) настройки", 72);
    }
    if (payload.type === "replace_state" || payload.type === "replace_state_begin") {
      return shorten(actor + " импортировал(а) резервную копию", 72);
    }

    return shorten(actor + " обновил(а) календарь", 72);
  }

  function buildUpdateHref(payload) {
    if (payload.type === "upsert_period" || payload.type === "delete_period") {
      return "#calendar";
    }
    if (payload.type === "upsert_log" || payload.type === "delete_log") {
      return "#day-log";
    }
    if (payload.type === "update_settings") {
      return "#settings";
    }
    if (payload.type === "replace_state" || payload.type === "replace_state_begin") {
      return "#backup";
    }
    return "#calendar";
  }

  function getSymptomLabel(key) {
    var item = SYMPTOMS.find(function (entry) {
      return entry.key === key;
    });
    return item ? item.label : "";
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
      return "—";
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
    }).format(parseIsoDate(isoDate));
  }

  function formatDateRange(startIso, endIso) {
    if (!startIso || !endIso) {
      return "—";
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
    if (!isoDate) {
      return "";
    }
    return isoDate.slice(8, 10) + "." + isoDate.slice(5, 7);
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

  function getSerializedSize(payload) {
    return new TextEncoder().encode(
      JSON.stringify({
        payload: {
          app: APP_ID,
          payload: payload,
        },
      })
    ).length;
  }

  function getSafeUpdateBudget() {
    return Math.max(12000, Number((window.webxdc && window.webxdc.sendUpdateMaxSize) || 128000) - 3000);
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
