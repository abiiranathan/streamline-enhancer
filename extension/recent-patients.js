(function () {
  "use strict";

  var RECENTS_KEY = "sl_recent_patients";
  var SESSION_KEY = "myVar";
  var MAX_RECENT = 8;
  var FALLBACK_URL = "/consultation/route";
  var WARD_DISPENSING_URL =
    "https://berakhah.streamlinehealth.tech/ward_dispensing_per_chart";

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

  function writeSessionVar(value) {
    if (value == null || value === "") return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, String(value));
    } catch (error) {
      /* storage unavailable - ignore */
    }
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
    var match =
      /episode_id=(\d+)/.exec(str) ||
      /episode_summary\/(\d+)/.exec(str) ||
      /\/patient_episodes\/(\d+)/.exec(str);
    return match ? validId(match[1]) : "";
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

  /* Drop previously stored entries that were not real patient names. */
  function pruneRecents() {
    var list = readRecents();
    var pruned = list.filter(function (entry) {
      return looksLikePatientName(entry && entry.name);
    });
    if (pruned.length !== list.length) writeRecents(pruned);
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
    return (
      document.getElementById("current_patient_id") !== null ||
      document.querySelector(".consultation-pat-table") !== null
    );
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
      patientId: inputValue("current_patient_id"),
      episodeId: validId(inputValue("current_episode_id")) || validId(readSessionVar()),
      source: currentSource(),
      url: window.location.href
    };
  }

  function sameEntry(entry, patient) {
    var source = patient.source || "";
    if (patient.episodeId && entry.episodeId) {
      return (
        String(entry.episodeId) === String(patient.episodeId) &&
        (entry.source || "") === source
      );
    }
    return (
      entry.name === patient.name &&
      (entry.number || "") === (patient.number || "") &&
      (entry.source || "") === source
    );
  }

  function remember(patient) {
    if (!patient || !patient.name) return;

    var list = readRecents().filter(function (entry) {
      return !sameEntry(entry, patient);
    });

    list.unshift({
      name: patient.name,
      number: patient.number || "",
      patientId: patient.patientId || "",
      episodeId: patient.episodeId || "",
      source: patient.source || currentSource(),
      url: patient.url || window.location.href,
      ts: Date.now()
    });

    writeRecents(list);
    render();
  }

  function openPatient(entry) {
    if (entry.episodeId) writeSessionVar(entry.episodeId);
    window.location.href = entry.url || FALLBACK_URL;
  }

  /* Episode summary renders a printable PDF. The trailing id is the same
     value the system keeps in sessionStorage.myVar. */
  function episodeSummaryUrl(entry) {
    var id = validId(entry.episodeId) || idFromUrl(entry.url) || validId(readSessionVar());
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
    header.textContent = "Recent Patients";

    var list = document.createElement("div");
    list.className = "sl-recent-list";

    var footer = document.createElement("div");
    footer.className = "sl-recent-footer";

    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "sl-recent-clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", function () {
      writeRecents([]);
      render();
    });
    footer.appendChild(clear);

    panel.appendChild(header);
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

    toggle.addEventListener("click", function () {
      var open = root.classList.toggle("sl-recent-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    root.appendChild(panel);
    root.appendChild(toggle);

    (document.body || document.documentElement).appendChild(root);
    ui = root;
  }

  function render() {
    if (!ui) return;

    var list = readRecents();
    var countEl = ui.querySelector(".sl-recent-count");
    var listEl = ui.querySelector(".sl-recent-list");

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
        item.appendChild(
          buildActionLink(
            summaryUrl,
            "📄",
            "Episode summary (PDF)",
            entry.name,
            "sl-recent-pdf"
          )
        );
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
        var episodeId =
          episodeIdFromRadio(target) || validId(readSessionVar()) || "";

        if (!validId(readSessionVar()) && episodeId) {
          writeSessionVar(episodeId);
        }

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

        /* Date/time links and other non-name cells must not be recorded. */
        if (!chosen) return;

        var url = chosen.href;
        if (!url && row) {
          var anchors = row.querySelectorAll("a[href]");
          for (var j = 0; j < anchors.length; j++) {
            if (looksLikePatientName(anchors[j].textContent) && anchors[j].href) {
              url = anchors[j].href;
              break;
            }
          }
        }

        remember({
          name: chosen.name,
          number: "",
          patientId: "",
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
    pruneRecents();
    render();
    watchForPatient();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
