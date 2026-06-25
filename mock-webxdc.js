(function () {
  if (window.webxdc) {
    return;
  }

  var STORAGE_KEY = "cycle-together.preview.updates.v1";
  var NAME_KEY = "cycle-together.preview.name";
  var ADDR_KEY = "cycle-together.preview.addr";
  var listener = null;
  var knownSerial = 0;

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function loadUpdates() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveUpdates(updates) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
  }

  function getSessionName() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get("name");
    var stored = window.sessionStorage.getItem(NAME_KEY);
    if (fromQuery) {
      window.sessionStorage.setItem(NAME_KEY, fromQuery);
      return fromQuery;
    }
    if (stored) {
      return stored;
    }
    var generated = "Участник " + Math.floor(Math.random() * 900 + 100);
    window.sessionStorage.setItem(NAME_KEY, generated);
    return generated;
  }

  function getSessionAddr() {
    var stored = window.sessionStorage.getItem(ADDR_KEY);
    if (stored) {
      return stored;
    }
    var generated = "preview-" + randomId();
    window.sessionStorage.setItem(ADDR_KEY, generated);
    return generated;
  }

  function deliverUpdatesSince(serial) {
    if (!listener) {
      knownSerial = serial;
      return;
    }
    var updates = loadUpdates();
    var maxSerial = updates.length ? updates[updates.length - 1].serial : 0;
    updates
      .filter(function (entry) {
        return entry.serial > serial;
      })
      .forEach(function (entry) {
        listener(Object.assign({}, entry, { max_serial: maxSerial }));
        knownSerial = entry.serial;
      });

    if (!updates.length) {
      knownSerial = 0;
    }
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) {
      deliverUpdatesSince(knownSerial);
    }
  });

  window.webxdc = {
    __mock: true,
    selfName: getSessionName(),
    selfAddr: getSessionAddr(),
    sendUpdateInterval: 0,
    sendUpdateMaxSize: 128000,
    sendUpdate: function (update) {
      var updates = loadUpdates();
      var serial = updates.length ? updates[updates.length - 1].serial + 1 : 1;
      var entry = Object.assign(
        {
          payload: null,
          info: "",
          summary: "",
          href: "",
        },
        update || {},
        {
          serial: serial,
          max_serial: serial,
        }
      );
      updates.push(entry);
      saveUpdates(updates);
      if (listener) {
        listener(entry);
      }
      knownSerial = serial;
    },
    setUpdateListener: function (callback, serial) {
      listener = callback;
      deliverUpdatesSince(serial || 0);
      return Promise.resolve();
    },
    __clearPreviewData: function () {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
})();
