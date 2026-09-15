(function () {
  "use strict";

  var MODAL_ID = "showPatientPrescriptionModal";
  var ROOT_CLASS = "sl-printing";
  var MODAL_TITLE = "Berakhah Medical Centre: Prescription";

  var originalParent = null;
  var originalNext = null;

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
    if (title && title.textContent.trim() !== MODAL_TITLE) {
      title.textContent = MODAL_TITLE;
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
      if (modal) restore(modal);
    }
  }

  var modal = getModal();
  if (modal) {
    setTitle(modal);
    var observer = new MutationObserver(sync);
    observer.observe(modal, { attributes: true, attributeFilter: ["class", "style"] });
  }

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
