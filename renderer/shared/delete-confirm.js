/* ==========================================================================
   Shared Delete Confirmation Helper (DeleteConfirm)
   --------------------------------------------------------------------------
   Provides a leak-free, in-place delete confirmation for table rows.
   All event listeners (container delegated click, document click for outside
   clicks, and document Escape keydown) are registered exactly ONCE upon
   attachment and never added or removed dynamically during user interactions.

   Each delete button contains both the trash SVG icon and the "Delete?" label:
     <button class="del-btn" data-id="123" ...>
       <span class="del-icon">...</span>
       <span class="del-label">Delete?</span>
     </button>

   Arming a button simply adds the 'is-armed' CSS class without rewriting HTML.
   Cancelling (pressing Escape, clicking outside, arming another row, or the
   3000ms timeout) disarms the button and clears the active timer.
   Pressing Escape while armed stops event propagation so modal windows are not
   closed on the first Escape press.
   ========================================================================== */

const DeleteConfirm = {
  attach({ container, onConfirm, timeout = 3000 }) {
    let armedId = null;
    let armedBtn = null;
    let timer = null;

    function disarm() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (armedBtn) {
        armedBtn.classList.remove('is-armed');
        armedBtn = null;
      }
      armedId = null;
    }

    function isArmed() {
      return armedId !== null;
    }

    function arm(btn, id) {
      disarm();
      armedId = id;
      armedBtn = btn;
      armedBtn.classList.add('is-armed');
      try {
        armedBtn.focus();
      } catch (e) {}

      timer = setTimeout(() => {
        disarm();
      }, timeout);
    }

    function handleContainerClick(e) {
      const btn = e.target.closest('.del-btn');
      if (!btn || !container.contains(btn)) {
        // Clicked inside container but not on a delete button
        disarm();
        return;
      }

      // Stop propagation so parent row selection handlers are not triggered
      e.stopPropagation();

      const id = btn.dataset.id;
      if (armedId === id) {
        // Confirmed second click
        disarm();
        if (typeof onConfirm === 'function') {
          onConfirm(id);
        }
      } else {
        // First click: arm this button
        arm(btn, id);
      }
    }

    function handleDocumentClick(e) {
      if (armedBtn && !armedBtn.contains(e.target)) {
        disarm();
      }
    }

    function handleKeydown(e) {
      if (e.key === 'Escape' && isArmed()) {
        e.preventDefault();
        e.stopPropagation();
        disarm();
      }
    }

    // Attach listeners ONCE
    container.addEventListener('click', handleContainerClick);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown, true);

    return {
      disarm,
      isArmed,
      destroy() {
        disarm();
        container.removeEventListener('click', handleContainerClick);
        document.removeEventListener('click', handleDocumentClick);
        document.removeEventListener('keydown', handleKeydown, true);
      },
    };
  },
};
