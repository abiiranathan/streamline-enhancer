(function () {
  "use strict";

  var RECENTS_KEY = "sl_recent_patients";
  var SETTINGS_KEY = "sl_recent_settings";
  var SESSION_KEY = "myVar";
  var MAX_RECENT = 8;
  var FALLBACK_URL = "/consultation/route";
  var WARD_DISPENSING_URL =
    "https://berakhah.streamlinehealth.tech/ward_dispensing_per_chart";

  var QUICK_LINKS = [
    { label: "Ward List", href: "/wards/select" },
    { label: "Patient Queue", href: "/patient_flow_monitoring/index" },
    { label: "List Patients", href: "/patients" }
  ];

  /* ------------------------------------------------------------------ */
  /* Storage helpers                                                     */
  /* ------------------------------------------------------------------ */

  function readRecents() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeRecents(list) {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch (error) {
      /* storage unavailable - ignore */
    }
  }

  function readSessionVar() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  function readSettings() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeSettings(settings) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      /* storage unavailable - ignore */
    }
  }

  /* Remove recents from previous days by default; opt out in the panel. */
  function onlyTodayEnabled() {
    return readSettings().onlyToday !== false;
  }

  function setOnlyToday(value) {
    var settings = readSettings();
    settings.onlyToday = !!value;
    writeSettings(settings);
  }

  function isToday(timestamp) {
    var value = Number(timestamp);
    if (!value) return false;
    var date = new Date(value);
    var now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  /* ------------------------------------------------------------------ */
  /* Patient extraction                                                  */
  /* ------------------------------------------------------------------ */

  function normalize(text) {
    return String(text == null ? "" : text)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function clean(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  /* "BMC-26-1901 (CASH)" -> "BMC-26-1901" */
  function cleanPatientNumber(value) {
    return clean(String(value == null ? "" : value).replace(/\([^)]*\)/g, " "));
  }

  /* Loose key for comparing patient numbers regardless of punctuation/case. */
  function normalizeNumber(value) {
    return String(value == null ? "" : value)
      .replace(/\([^)]*\)/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /* Which page the patient was seen on. */
  function currentSource() {
    var path = String(window.location.pathname || "").toLowerCase();
    if (path.indexOf("patient_episodes") !== -1) return "patient_episodes";
    if (path.indexOf("consultation") !== -1) return "consultation";
    return "other";
  }

  function sourceLabel(source) {
    if (source === "patient_episodes") return "Episodes";
    if (source === "consultation") return "Consultation";
    return "";
  }

  function inputValue(id) {
    var el = document.getElementById(id);
    return el && typeof el.value === "string" ? el.value.trim() : "";
  }

  /* An episode id is a non-zero number. */
  function validId(value) {
    var str = String(value == null ? "" : value).trim();
    if (!str || str === "0") return "";
    var match = /\d+/.exec(str);
    if (!match || match[0] === "0") return "";
    return match[0];
  }

  /* The episode radios sometimes carry value="0" while the real id lives in
     the element id ("episode_id_4650") or the onchange handler
     ("showOnly('4650', ...)"). Resolve it from any of those. */
  function episodeIdFromRadio(radio) {
    var fromValue = validId(radio.value);
    if (fromValue) return fromValue;

    var idMatch = /(\d+)\s*$/.exec(radio.id || "");
    if (idMatch && validId(idMatch[1])) return idMatch[1];

    var onchange = radio.getAttribute("onchange") || "";
    var showMatch = /showOnly\(\s*['"]?(\d+)/.exec(onchange);
    if (showMatch && validId(showMatch[1])) return showMatch[1];

    return validId(radio.getAttribute("data-episode-id")) || "";
  }

  function idFromUrl(url) {
    var str = String(url || "");
    /* Only real episode id patterns - "/patient_episodes/<id>" is a patient id. */
    var match = /episode_id=(\d+)/.exec(str) || /episode_summary\/(\d+)/.exec(str);
    return match ? validId(match[1]) : "";
  }

  /* Find a column index by its table header text. */
  function tableHeaderIndex(row, test) {
    var table = row && row.closest ? row.closest("table") : null;
    if (!table) return -1;
    var headers = table.querySelectorAll("thead th");
    for (var i = 0; i < headers.length; i++) {
      if (test.test(normalize(headers[i].textContent))) return i;
    }
    return -1;
  }

  function rowCellText(row, index) {
    if (!row || index < 0) return "";
    var cells = row.querySelectorAll("td");
    if (index >= cells.length) return "";
    return clean(cells[index].textContent);
  }

  /* Reject values that are clearly not a person's name (e.g. the episode
     date/time link "Monday, 3rd August 2026 at 5:46pm"). */
  function looksLikePatientName(value) {
    var name = clean(value);
    if (name.length < 2) return false;
    if (!/[a-z]/i.test(name)) return false;
    if (/^\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i.test(name) && /[,\d]/.test(name)) {
      return false;
    }
    if (/\b\d{1,2}:\d{2}/.test(name)) return false;
    if (/\b(19|20)\d{2}\b/.test(name)) return false;
    if (
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/i.test(
        name
      ) &&
      /\d/.test(name)
    ) {
      return false;
    }
    if (/\b\d{1,2}(st|nd|rd|th)\b/i.test(name)) return false;
    return true;
  }

  /* Drop invalid entries and, when "Today only" is on, anything captured on a
     previous day. Returns the list that should be rendered. */
  function pruneRecents() {
    var list = readRecents();
    var onlyToday = onlyTodayEnabled();
    var pruned = list.filter(function (entry) {
      if (!looksLikePatientName(entry && entry.name)) return false;
      if (onlyToday && !isToday(entry && entry.ts)) return false;
      return true;
    });
    if (pruned.length !== list.length) writeRecents(pruned);
    return pruned;
  }

  /* Read every "{header} -> {body}" card pair on the consultation page. */
  function readPatientCards() {
    var cards = {};
    var headers = document.querySelectorAll(".card-header, .card-title");
    for (var i = 0; i < headers.length; i++) {
      var card = headers[i].closest(".card");
      if (!card) continue;
      var body = card.querySelector(".card-body");
      if (!body) continue;

      var label = normalize(headers[i].textContent);
      var value = clean(body.textContent);
      if (label && value && !cards[label]) cards[label] = value;
    }
    return cards;
  }

  function pickCard(cards, tests) {
    var labels = Object.keys(cards);
    for (var i = 0; i < labels.length; i++) {
      for (var j = 0; j < tests.length; j++) {
        if (tests[j].test(labels[i])) return cards[labels[i]];
      }
    }
    return "";
  }

  function isConsultationPage() {
    if (/consultation/i.test(window.location.pathname)) return true;
    return document.querySelector(".consultation-pat-table") !== null;
  }

  /* The clerkship/consultation page renders the patient as cards. */
  function patientFromPage() {
    var cards = readPatientCards();

    var name = pickCard(cards, [
      /^full\s*names?$/,
      /patient'?s?\s*names?/,
      /^names?$/
    ]);
    if (!name) return null;

    var number =
      pickCard(cards, [/patient\s*(no|number|#|id)/]) || inputValue("patientnumber");

    return {
      name: name,
      number: number,
      patientId: validId(inputValue("current_patient_id")),
      /* The per-patient episode id is server-rendered here. sessionStorage
         myVar is only the site's UI selection and is not per-patient. */
      episodeId: validId(inputValue("current_episode_id")),
      source: currentSource(),
      url: window.location.href
    };
  }

  /* A patient is identified by name + number. Never by episode id, which can
     be stale (myVar) and would make one patient overwrite another. */
  function samePatient(entry, patient) {
    var entryName = normalize(entry.name);
    var patientName = normalize(patient.name);
    if (!entryName || !patientName || entryName !== patientName) return false;

    var entryNumber = normalizeNumber(entry.number);
    var patientNumber = normalizeNumber(patient.number);
    if (!entryNumber || !patientNumber) return true;
    return entryNumber === patientNumber;
  }

  function remember(patient) {
    if (!patient || !patient.name) return;

    var list = readRecents();
    var existingIndex = -1;
    for (var i = 0; i < list.length; i++) {
      if (samePatient(list[i], patient)) {
        existingIndex = i;
        break;
      }
    }

    var previous = existingIndex >= 0 ? list.splice(existingIndex, 1)[0] : null;
    var incomingSource = patient.source || currentSource();

    var entry;
    if (previous && previous.source === "consultation" && incomingSource !== "consultation") {
      /* An episodes/flow selection must not clobber a consultation entry - the
         consultation is the one that can open the episode summary and ward
         views. Keep it and only fill in any missing details. */
      entry = {
        name: previous.name || patient.name,
        number: cleanPatientNumber(previous.number) || cleanPatientNumber(patient.number) || "",
        patientId: validId(previous.patientId) || validId(patient.patientId) || "",
        episodeId: validId(previous.episodeId) || validId(patient.episodeId) || "",
        source: "consultation",
        url: previous.url || patient.url || window.location.href,
        ts: Date.now()
      };
    } else {
      entry = {
        name: patient.name,
        number:
          cleanPatientNumber(patient.number) ||
          (previous ? cleanPatientNumber(previous.number) : "") ||
          "",
        patientId: patient.patientId || (previous ? previous.patientId : "") || "",
        episodeId: validId(patient.episodeId) || (previous ? validId(previous.episodeId) : "") || "",
        source: incomingSource,
        url: patient.url || (previous ? previous.url : "") || window.location.href,
        ts: Date.now()
      };
    }

    list.unshift(entry);
    writeRecents(list);
    render();
  }

  /* Prefer the stored id (captured from the session myVar, which is what the
     route uses), then fall back to an id embedded in the destination URL. */
  function resolveEntryId(entry) {
    return validId(entry.episodeId) || idFromUrl(entry.url) || "";
  }

  /* Ask the page to POST the same selection the site's paymentCheck() makes.
     The server sets its session and returns the URL to open. */
  function requestConsultation(episodeId, patientId, action, done) {
    var token = "sl-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    var settled = false;

    function finish(response) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onAck);
      done(response);
    }

    function onAck(event) {
      if (event.source && event.source !== window) return;
      var data = event.data;
      if (data && data.type === "streamline:consultation-selection-ack" && data.token === token) {
        finish(data.response);
      }
    }

    window.addEventListener("message", onAck);
    try {
      window.postMessage(
        {
          type: "streamline:consultation-selection",
          token: token,
          episodeId: episodeId,
          patientId: patientId,
          action: action
        },
        "*"
      );
    } catch (error) {
      /* ignore */
    }
    window.setTimeout(function () {
      finish("");
    }, 6000);
  }

  /* Set the site's session value (jQuery session plugin + sessionStorage). */
  function setSessionValue(value, done) {
    var token = "sl-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    var settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onAck);
      done();
    }

    function onAck(event) {
      if (event.source && event.source !== window) return;
      var data = event.data;
      if (data && data.type === "streamline:set-session-ack" && data.token === token) {
        finish();
      }
    }

    window.addEventListener("message", onAck);
    try {
      window.postMessage(
        { type: "streamline:set-session", key: SESSION_KEY, value: value, token: token },
        "*"
      );
    } catch (error) {
      /* ignore */
    }
    window.setTimeout(finish, 400);
  }

  /* The server reads the jQuery-session cookie(s) named "__session:<id>:myVar".
     Several can linger with stale values, so set them all to the target
     episode id synchronously before navigating. */
  function setMyVarCookie(value) {
    var names = [];
    String(document.cookie || "").split(";").forEach(function (part) {
      var name = part.split("=")[0].trim();
      if (name && /(^|:)myVar$/.test(name)) names.push(name);
    });

    names.forEach(function (name) {
      document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; SameSite=Lax";
    });

    if (!names.length) {
      document.cookie =
        "__session:" +
        Math.random() +
        ":myVar=" +
        encodeURIComponent(value) +
        "; path=/; SameSite=Lax";
    }
  }

  /* Open the episode summary in a new tab with myVar pointing at this entry. */
  function openEpisodeSummary(entry, url) {
    var episodeId = validId(entry.episodeId) || idFromUrl(entry.url);
    var patientId = validId(entry.patientId);

    if (!episodeId) {
      window.open(url, "_blank", "noopener");
      return;
    }

    /* Belt and braces: set the client-side session value too. */
    setMyVarCookie(episodeId);
    setSessionValue(episodeId, function () {});

    /* The summary is server-session driven. Set the server session with the
       same request the site uses, then open the summary. Open the tab
       synchronously so it is not popup-blocked, then point it at the URL
       once the session is set. */
    if (!patientId) {
      window.location.href = url;
      return;
    }

    var win = null;
    try {
      win = window.open("about:blank", "_blank");
    } catch (error) {
      win = null;
    }

    requestConsultation(episodeId, patientId, "consultation", function () {
      if (win && !win.closed) {
        win.location.href = url;
      } else {
        window.location.href = url;
      }
    });
  }

  function openPatient(entry) {
    var episodeId = validId(entry.episodeId) || idFromUrl(entry.url);
    var patientId = validId(entry.patientId);
    var fallback = entry.url || FALLBACK_URL;

    if (!episodeId || !patientId) {
      window.location.href = fallback;
      return;
    }

    requestConsultation(episodeId, patientId, "consultation", function (response) {
      var result = String(response || "").trim();
      if (result && result !== "unpaid") {
        window.location.href = result;
        return;
      }
      if (result === "unpaid") {
        window.alert("This consultation cannot be opened yet because it is unpaid.");
        return;
      }
      window.location.href = fallback;
    });
  }

  /* Episode summary renders a printable PDF. The trailing id is the same
     value the system keeps in sessionStorage.myVar. */
  function episodeSummaryUrl(entry) {
    var id = resolveEntryId(entry);
    if (!id) return "";
    return "/patients/episode_summary/" + encodeURIComponent(id);
  }

  function buildActionLink(href, glyph, title, patientName, extraClass) {
    var link = document.createElement("a");
    link.className = "sl-recent-action " + extraClass;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = title;
    link.setAttribute("aria-label", title + " for " + patientName);
    link.textContent = glyph;
    return link;
  }

  /* ------------------------------------------------------------------ */
  /* Floating UI                                                         */
  /* ------------------------------------------------------------------ */

  var ui = null;

  function buildUI() {
    if (document.getElementById("sl-recent-root")) {
      ui = document.getElementById("sl-recent-root");
      return;
    }

    var root = document.createElement("div");
    root.id = "sl-recent-root";
    root.className = "sl-recent";

    var panel = document.createElement("div");
    panel.className = "sl-recent-panel";

    var header = document.createElement("div");
    header.className = "sl-recent-header";

    var headerTitle = document.createElement("span");
    headerTitle.className = "sl-recent-title";
    headerTitle.textContent = "Recent Patients";
    header.appendChild(headerTitle);

    var credit = document.createElement("span");
    credit.className = "sl-recent-credit";
    credit.textContent = "Designed by Dr. Abiira";
    header.appendChild(credit);

    var links = document.createElement("div");
    links.className = "sl-recent-links";
    QUICK_LINKS.forEach(function (item) {
      var link = document.createElement("a");
      link.className = "sl-recent-link";
      link.href = item.href;
      link.textContent = item.label;
      links.appendChild(link);
    });

    var list = document.createElement("div");
    list.className = "sl-recent-list";

    var footer = document.createElement("div");
    footer.className = "sl-recent-footer";

    var setting = document.createElement("label");
    setting.className = "sl-recent-setting";
    setting.title = "Remove recent patients that were not seen today";

    var onlyToday = document.createElement("input");
    onlyToday.type = "checkbox";
    onlyToday.className = "sl-recent-only-today";
    onlyToday.checked = onlyTodayEnabled();
    onlyToday.addEventListener("change", function () {
      setOnlyToday(onlyToday.checked);
      render();
    });
    setting.appendChild(onlyToday);

    var settingLabel = document.createElement("span");
    settingLabel.textContent = "Today only";
    setting.appendChild(settingLabel);

    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "sl-recent-clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", function () {
      writeRecents([]);
      render();
    });

    footer.appendChild(setting);
    footer.appendChild(clear);

    panel.appendChild(header);
    panel.appendChild(links);
    panel.appendChild(list);
    panel.appendChild(footer);

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sl-recent-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Recent patients");

    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute(
      "d",
      "M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z"
    );
    icon.appendChild(path);

    var label = document.createElement("span");
    label.className = "sl-recent-label";
    label.textContent = "Recent";

    var count = document.createElement("span");
    count.className = "sl-recent-count";
    count.style.display = "none";

    toggle.appendChild(icon);
    toggle.appendChild(label);
    toggle.appendChild(count);

    function setOpen(open) {
      root.classList.toggle("sl-recent-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function () {
      setOpen(!root.classList.contains("sl-recent-open"));
    });

    /* Close when clicking anywhere outside the panel. */
    document.addEventListener("click", function (event) {
      if (!root.classList.contains("sl-recent-open")) return;
      if (root.contains(event.target)) return;
      setOpen(false);
    });

    /* Close on Escape as well. */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });

    root.appendChild(panel);
    root.appendChild(toggle);

    (document.body || document.documentElement).appendChild(root);
    ui = root;
  }

  function render() {
    if (!ui) return;

    var list = pruneRecents();
    var countEl = ui.querySelector(".sl-recent-count");
    var listEl = ui.querySelector(".sl-recent-list");
    var onlyTodayEl = ui.querySelector(".sl-recent-only-today");

    if (onlyTodayEl) onlyTodayEl.checked = onlyTodayEnabled();

    if (countEl) {
      countEl.textContent = String(list.length);
      countEl.style.display = list.length ? "" : "none";
    }

    listEl.textContent = "";

    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "sl-recent-empty";
      empty.textContent = "No recent patients yet.";
      listEl.appendChild(empty);
      return;
    }

    list.forEach(function (entry) {
      var item = document.createElement("div");
      item.className = "sl-recent-item";

      var open = document.createElement("button");
      open.type = "button";
      open.className = "sl-recent-open";

      var info = document.createElement("span");
      info.className = "sl-recent-info";

      var name = document.createElement("span");
      name.className = "sl-recent-name";
      name.textContent = entry.name;
      info.appendChild(name);

      if (entry.number) {
        var number = document.createElement("span");
        number.className = "sl-recent-number";
        number.textContent = entry.number;
        info.appendChild(number);
      }

      open.appendChild(info);

      var label = sourceLabel(entry.source);
      if (label) {
        var badge = document.createElement("span");
        badge.className = "sl-recent-source sl-recent-source-" + entry.source;
        badge.textContent = label;
        open.appendChild(badge);
      }

      open.addEventListener("click", function () {
        openPatient(entry);
      });
      item.appendChild(open);

      var summaryUrl = episodeSummaryUrl(entry);
      if (summaryUrl) {
        var pdf = buildActionLink(
          summaryUrl,
          "📄",
          "Episode summary (PDF)",
          entry.name,
          "sl-recent-pdf"
        );
        pdf.addEventListener("click", function (event) {
          event.preventDefault();
          openEpisodeSummary(entry, summaryUrl);
        });
        item.appendChild(pdf);
      }

      if (entry.source === "consultation") {
        item.appendChild(
          buildActionLink(
            WARD_DISPENSING_URL,
            "💊",
            "Ward dispensing per chart",
            entry.name,
            "sl-recent-ward"
          )
        );
      }

      listEl.appendChild(item);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Episode selection (patient list pages)                              */
  /* ------------------------------------------------------------------ */

  document.addEventListener(
    "change",
    function (event) {
      var target = event.target;
      if (!target || !target.matches) return;
      if (!target.matches('input[name="episode_id"]') || !target.checked) return;

      /* Give the page's own onchange handler a tick to set myVar. */
      window.setTimeout(function () {
        /* Never fall back to sessionStorage.myVar - it is not the episode id. */
        var episodeId = episodeIdFromRadio(target) || "";

        var row = target.closest("tr");

        var candidates = [];
        function addCandidate(value, href) {
          var cleaned = clean(value);
          if (cleaned) candidates.push({ name: cleaned, href: href || "" });
        }

        if (row) {
          Array.prototype.forEach.call(row.querySelectorAll("[data-patient-name]"), function (el) {
            addCandidate(el.getAttribute("data-patient-name") || el.textContent, el.href || "");
          });
          Array.prototype.forEach.call(row.querySelectorAll("a[href]"), function (a) {
            addCandidate(a.textContent, a.href || "");
          });
        }

        var chosen = null;
        for (var i = 0; i < candidates.length; i++) {
          if (looksLikePatientName(candidates[i].name)) {
            chosen = candidates[i];
            break;
          }
        }

        var name = chosen ? chosen.name : "";
        var url = chosen ? chosen.href : "";

        /* Many rows (patient flow) have no link: read the "Name" column. */
        if (!name && row) {
          var nameIndex = tableHeaderIndex(row, /\bname\b/);
          if (nameIndex < 0) nameIndex = tableHeaderIndex(row, /full\s*names?/);
          var cellName = rowCellText(row, nameIndex);
          if (looksLikePatientName(cellName)) name = cellName;
        }

        /* Date/time links and other non-name cells must not be recorded. */
        if (!name) return;

        if (!url && row) {
          var anchors = row.querySelectorAll("a[href]");
          for (var j = 0; j < anchors.length; j++) {
            if (looksLikePatientName(anchors[j].textContent) && anchors[j].href) {
              url = anchors[j].href;
              break;
            }
          }
        }

        var number = row ? rowCellText(row, tableHeaderIndex(row, /patient\s*(no|number|#)/)) : "";

        /* The patient id lives in a hidden input keyed by the episode id
           (#patient_id_<episodeId>), same source the site's paymentCheck uses. */
        var patientId = "";
        if (episodeId) {
          var patientInput = document.getElementById("patient_id_" + episodeId);
          if (patientInput) patientId = validId(patientInput.value);
        }
        if (!patientId && row) {
          var idInput = row.querySelector('[id^="patient_id_"]');
          if (idInput) patientId = validId(idInput.value);
        }

        remember({
          name: name,
          number: number,
          patientId: patientId,
          episodeId: episodeId,
          source: currentSource(),
          url: url || window.location.href
        });
      }, 0);
    },
    true
  );

  /* ------------------------------------------------------------------ */
  /* Bootstrap                                                           */
  /* ------------------------------------------------------------------ */

  function tryCapture() {
    var patient = patientFromPage();
    if (!patient) return false;
    remember(patient);
    console.log("[Streamline] recent-patient captured", {
      name: patient.name,
      number: patient.number,
      episodeId: patient.episodeId,
      source: patient.source || currentSource(),
      myVar: readSessionVar()
    });
    return true;
  }

  function watchForPatient() {
    if (!isConsultationPage()) return;
    if (tryCapture()) return;

    var timer = null;
    var scheduled = false;
    var attempts = 0;

    function stop() {
      observer.disconnect();
      if (timer) window.clearInterval(timer);
    }

    function attempt() {
      if (tryCapture()) {
        stop();
        return true;
      }
      return false;
    }

    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(function () {
        scheduled = false;
        attempt();
      }, 120);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    timer = window.setInterval(function () {
      attempts += 1;
      if (attempt()) return;
      if (attempts > 20) {
        stop();
        console.warn(
          "[Streamline] recent-patients: could not find the patient name.",
          "path:", window.location.pathname,
          "card labels:", Object.keys(readPatientCards()),
          "current_patient_id:", inputValue("current_patient_id")
        );
      }
    }, 250);
  }

  function init() {
    buildUI();
    render();
    watchForPatient();

    /* Re-evaluate "today" when the tab is refocused, so a panel left open
       across midnight drops the previous day's entries. */
    window.addEventListener("focus", render);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
