(function () {
  "use strict";

  /* The system selects patients through the jQuery session plugin
     (`$.session.set("myVar", id)`), not a plain sessionStorage key. Bridge
     requests from the isolated content script so we set the real value. */
  function installSessionBridge() {
    if (window.__streamlineSessionBridge) return;
    window.__streamlineSessionBridge = true;

    /* Replays the site's paymentCheck() request, which is what actually sets
       the server-side current episode/patient and returns the target URL. */
    function selectConsultation(data) {
      function reply(response) {
        try {
          window.postMessage(
            {
              type: "streamline:consultation-selection-ack",
              token: data.token,
              response: response == null ? "" : String(response)
            },
            "*"
          );
        } catch (error) {
          /* ignore */
        }
      }

      var $ = window.jQuery;
      if (!$ || !$.ajax) {
        reply("");
        return;
      }

      try {
        $.ajax({
          method: "POST",
          url: "/check_clinical_consultation_payment",
          data: {
            episode_id: data.episodeId,
            patient_id: data.patientId,
            action: data.action
          },
          success: function (response) {
            reply(response);
          },
          error: function () {
            reply("");
          }
        });
      } catch (error) {
        reply("");
      }
    }

    window.addEventListener("message", function (event) {
      if (event.source && event.source !== window) return;
      var data = event.data;
      if (!data || !data.type) return;

      if (data.type === "streamline:consultation-selection") {
        selectConsultation(data);
        return;
      }

      if (data.type !== "streamline:set-session") return;

      var key = String(data.key || "");
      var value = data.value == null ? "" : String(data.value);

      try {
        if (
          window.jQuery &&
          window.jQuery.session &&
          typeof window.jQuery.session.set === "function"
        ) {
          window.jQuery.session.set(key, value);
        }
      } catch (error) {
        /* plugin unavailable */
      }

      try {
        window.sessionStorage.setItem(key, value);
      } catch (error) {
        /* storage unavailable */
      }

      try {
        window.postMessage({ type: "streamline:set-session-ack", token: data.token }, "*");
      } catch (error) {
        /* ignore */
      }
    });
  }

  installSessionBridge();

  if (window.__streamlineDiagnosisSearchFixApplied) return;
  window.__streamlineDiagnosisSearchFixApplied = true;

  var MAX_JQUERY_ATTEMPTS = 20;

  function isClerkshipPage() {
    return (
      document.querySelector("#primary_diagnosis") !== null ||
      document.querySelector("#confirm_primary_diagnosis") !== null ||
      document.querySelector(".sec_d") !== null
    );
  }

  function applyDiagnosisSearchFix() {
    var $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.select2) return false;

    /* Case-insensitive substring match built on String.prototype.indexOf */
    function matchesQuery(text, query) {
      return (
        String.prototype.indexOf.call(
          String(text).toLowerCase(),
          String(query).toLowerCase()
        ) !== -1
      );
    }

    /* Relevance of a result for the query.
         0 - the diagnosis name (after the "CODE | " prefix) begins with it
         1 - it begins a word (e.g. "Malaria" for "mal")
         2 - it is embedded inside a word (e.g. "Antimalarial" for "mal")
       Returns null when the text does not match at all. */
    function relevance(text, query) {
      var lowerText = String(text).toLowerCase();
      var lowerQuery = String(query).toLowerCase();

      var index = String.prototype.indexOf.call(lowerText, lowerQuery);
      if (index === -1) return null;

      var name = lowerText;
      var separator = lowerText.indexOf(" | ");
      if (separator !== -1) name = lowerText.slice(separator + 3);

      var score;
      if (String.prototype.indexOf.call(name, lowerQuery) === 0) {
        score = 0;
      } else if (index === 0 || !/[a-z0-9]/.test(lowerText.charAt(index - 1))) {
        score = 1;
      } else {
        score = 2;
      }

      return { score: score, index: index, length: lowerText.length };
    }

    function filterResults(results, query) {
      if (!query || !results || !results.length) return results;

      var scored = [];
      for (var i = 0; i < results.length; i++) {
        var item = results[i];
        if (!item) continue;

        var rank = relevance(item.text, query);
        if (rank) {
          scored.push({ item: item, rank: rank });
        } else if (item.children && item.children.length) {
          var children = filterResults(item.children, query);
          if (children.length) {
            var clone = $.extend({}, item);
            clone.children = children;
            scored.push({ item: clone, rank: null });
          }
        }
      }

      scored.sort(function (a, b) {
        if (!a.rank || !b.rank) {
          if (a.rank) return -1;
          if (b.rank) return 1;
          return 0;
        }
        if (a.rank.score !== b.rank.score) return a.rank.score - b.rank.score;
        if (a.rank.index !== b.rank.index) return a.rank.index - b.rank.index;
        return a.rank.length - b.rank.length;
      });

      var ordered = [];
      for (var j = 0; j < scored.length; j++) {
        ordered.push(scored[j].item);
      }
      return ordered;
    }

    function patchDiagnosisSelect(element) {
      var $element = $(element);
      var instance = $element.data("select2");
      if (!instance) return;

      /* select2 4.x stores the ajax data adapter on the core instance as
         "dataAdapter"; older builds exposed it as "data". */
      var adapter = instance.dataAdapter || instance.data;
      if (!adapter || !adapter.ajaxOptions) return;

      var ajaxOptions = adapter.ajaxOptions;
      if (ajaxOptions.__streamlineQueryFilter) return;

      var baseData = ajaxOptions.data;
      var baseTransport = ajaxOptions.transport;

      /* Always forward the raw term so the transport can match against it,
         even for queries shorter than the server's 3 character minimum. */
      ajaxOptions.data = function (params) {
        var data =
          (typeof baseData === "function" ? baseData.call(this, params) : baseData) || {};
        if (params && params.term != null) {
          data = $.extend({}, data, { q: params.term });
        }
        return data;
      };

      ajaxOptions.transport = function (params, onSuccess, onFailure) {
        var query = params && params.data ? params.data.q : "";
        return baseTransport.call(
          this,
          params,
          function (data) {
            if (!data || !Array.isArray(data.results)) {
              onSuccess(data);
              return;
            }
            onSuccess($.extend({}, data, { results: filterResults(data.results, query) }));
          },
          onFailure
        );
      };

      ajaxOptions.__streamlineQueryFilter = true;
    }

    function patchAllDiagnosisSelects() {
      $("#primary_diagnosis, #confirm_primary_diagnosis, .sec_d").each(function () {
        patchDiagnosisSelect(this);
      });
    }

    /* Keep rows added later (e.g. "Add row") covered too. */
    var baseInit = window.diagnosisSelect2Init;
    if (typeof baseInit === "function") {
      window.diagnosisSelect2Init = function (selectorOrEl) {
        baseInit(selectorOrEl);
        $(selectorOrEl).each(function () {
          patchDiagnosisSelect(this);
        });
      };
    }

    patchAllDiagnosisSelects();

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes, function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches(".sec_d")) {
            patchDiagnosisSelect(node);
          }
          if (node.querySelectorAll) {
            Array.prototype.forEach.call(node.querySelectorAll(".sec_d"), patchDiagnosisSelect);
          }
        });
      });
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    return true;
  }

  if (!isClerkshipPage()) return;

  var attempts = 0;
  function start() {
    if (applyDiagnosisSearchFix()) return;
    attempts += 1;
    if (attempts < MAX_JQUERY_ATTEMPTS) {
      window.setTimeout(start, 200);
    }
  }

  start();
})();
