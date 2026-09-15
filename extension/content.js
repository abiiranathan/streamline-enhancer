(function () {
  "use strict";

  /* ======================================================================
     Prescription page fixes
     ====================================================================== */

  function toNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  function numberWithCommas(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function rowId(el) {
    var match = /\d+(?=\D*$)/.exec(el.id || "");
    return match ? match[0] : null;
  }

  function makeEditable(input) {
    if (!input) return;
    if (input.hasAttribute("readonly")) input.removeAttribute("readonly");
    input.readOnly = false;
  }

  function recalculateTotal() {
    var total = 0;
    document.querySelectorAll(".item_price").forEach(function (el) {
      total += toNumber(el.value);
    });

    var grandTotal = document.getElementById("itemGrandTotal");
    if (grandTotal) grandTotal.textContent = numberWithCommas(total) + " Ugx";

    var hiddenTotal = document.getElementById("total_amount");
    if (hiddenTotal) hiddenTotal.value = total;
  }

  function recalculateRow(input) {
    var id = rowId(input);
    if (id === null) return;

    var quantity = toNumber(input.value);
    var sellingPriceEl = document.getElementById("selling_price" + id);
    var sellingPrice = sellingPriceEl ? toNumber(sellingPriceEl.value) : 0;

    var itemPriceEl = document.getElementById("item_price_" + id);
    if (itemPriceEl) itemPriceEl.value = Math.round(quantity * sellingPrice);

    recalculateTotal();
  }

  var prescriptionObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains("item_dispense")) {
          makeEditable(node);
        }
        node.querySelectorAll && node.querySelectorAll(".item_dispense").forEach(makeEditable);
      });
    });
  });

  function applyPrescriptionPageFixes() {
    document.addEventListener(
      "change",
      function (event) {
        var target = event.target;
        if (target && target.classList && target.classList.contains("item_dispense")) {
          recalculateRow(target);
        }
      },
      true
    );

    document.querySelectorAll(".item_dispense").forEach(makeEditable);
    recalculateTotal();
    prescriptionObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /* ======================================================================
     Clerkship page fixes (DOM only - main world logic lives in page.js)
     ====================================================================== */

  function ensureNewAttendanceDefault() {
    var group = document.querySelectorAll('input[name="attendance"]');
    if (!group.length) return;

    if (document.querySelector('input[name="attendance"]:checked')) return;

    var newAttendance = document.querySelector('input[name="attendance"][value="1"]');
    if (!newAttendance) return;

    newAttendance.checked = true;
    newAttendance.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyClerkshipPageFixes() {
    ensureNewAttendanceDefault();
  }

  /* ======================================================================
     Page detection + bootstrap
     ====================================================================== */

  function isPrescriptionPage() {
    return (
      document.querySelector("#payments_items") !== null ||
      document.querySelector(".item_dispense") !== null
    );
  }

  function isClerkshipPage() {
    return (
      document.querySelector("#primary_diagnosis") !== null ||
      document.querySelector("#confirm_primary_diagnosis") !== null ||
      document.querySelector(".sec_d") !== null ||
      document.querySelector('input[name="attendance"]') !== null
    );
  }

  function init() {
    if (isPrescriptionPage()) {
      applyPrescriptionPageFixes();
    }
    if (isClerkshipPage()) {
      applyClerkshipPageFixes();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
