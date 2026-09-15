(function () {
  "use strict";

  var MODAL_ID = "showPatientPrescriptionModal";
  var ROOT_CLASS = "sl-printing";
  var MODAL_TITLE = "Berakhah Medical Centre: Prescription";

  var originalParent = null;
  var originalNext = null;
  var patientName = "";

  /* The patient name is the cell that also holds the "Date Of Admission"
     note; fall back to the second cell of the row. */
  function patientNameFromRow(row) {
    if (!row) return "";
    var marker = row.querySelector("small");
    var cell = marker ? marker.closest("td") : null;
    if (!cell) {
      var cells = row.querySelectorAll("td");
      cell = cells.length > 1 ? cells[1] : null;
    }
    if (!cell) return "";

    var clone = cell.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll("small"), function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });

    return clone.textContent
      .replace(/\s+/g, " ")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
  }

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function modalIsOpen(modal) {
    if (!modal) return false;
    if (modal.classList.contains("show")) return true;
    return modal.style.display !== "" && modal.style.display !== "none";
  }

  /* Move the modal to <body> so print CSS can hide every sibling, which
     removes the tall background page from the printed document. */
  function moveToBody(modal) {
    if (modal.parentNode === document.body) return;
    if (!originalParent) {
      originalParent = modal.parentNode;
      originalNext = modal.nextSibling;
    }
    document.body.appendChild(modal);
  }

  function restore(modal) {
    if (originalParent && modal.parentNode === document.body && originalParent.parentNode) {
      if (originalNext && originalNext.parentNode === originalParent) {
        originalParent.insertBefore(modal, originalNext);
      } else {
        originalParent.appendChild(modal);
      }
    }
    originalParent = null;
    originalNext = null;
  }

  function setTitle(modal) {
    if (!modal) return;
    var title = modal.querySelector(".modal-title");
    if (!title) return;
    var text = patientName ? MODAL_TITLE + " - " + patientName : MODAL_TITLE;
    if (title.textContent.trim() !== text) {
      title.textContent = text;
    }
  }

  function sync() {
    var modal = getModal();
    if (modalIsOpen(modal)) {
      setTitle(modal);
      moveToBody(modal);
      document.documentElement.classList.add(ROOT_CLASS);
    } else {
      document.documentElement.classList.remove(ROOT_CLASS);
      patientName = "";
      if (modal) restore(modal);
    }
  }

  var modal = getModal();
  if (modal) {
    setTitle(modal);
    var observer = new MutationObserver(sync);
    observer.observe(modal, { attributes: true, attributeFilter: ["class", "style"] });
  }

  /* Capture the patient name from the row whose "View Ward Prescription"
     button was clicked, before the modal opens. */
  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest(".viewPrescription") : null;
      if (!button) return;
      patientName = patientNameFromRow(button.closest("tr"));
    },
    true
  );

  window.addEventListener("beforeprint", sync);

  if (window.matchMedia) {
    var media = window.matchMedia("print");
    var onChange = function () {
      sync();
    };
    if (media.addEventListener) media.addEventListener("change", onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync);
  } else {
    sync();
  }
})();
