/* ==========================================================================
   Shared Custom Scrollbar Helper (window.CustomScrollbar)
   --------------------------------------------------------------------------
   Attaches a thin custom scrollbar (thumb sizing + track click + drag) to a
   scrollable element. Callers keep ownership of show/hide via the returned
   update() function or by toggling the track's display directly.
   ========================================================================== */

(function () {
  'use strict';

  function attach({ scrollArea, track, thumb }) {
    function update() {
      const { scrollHeight, clientHeight, scrollTop } = scrollArea;
      if (!scrollHeight || clientHeight >= scrollHeight) {
        track.style.display = 'none';
        return;
      }

      track.style.display = 'block';
      const trackH = track.clientHeight;
      const thumbH = Math.max(24, (clientHeight / scrollHeight) * trackH);
      const maxTop = trackH - thumbH;
      const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;

      thumb.style.height = `${thumbH}px`;
      thumb.style.top = `${thumbTop}px`;
    }

    scrollArea.addEventListener('scroll', update, { passive: true });

    // Click track to jump scroll position
    track.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const thumbH = thumb.offsetHeight;
      const ratio = (e.clientY - rect.top - thumbH / 2) / (rect.height - thumbH);
      const clamped = Math.max(0, Math.min(1, ratio));
      scrollArea.scrollTop = clamped * (scrollArea.scrollHeight - scrollArea.clientHeight);
    });

    // Drag the thumb
    let dragging = false;
    let startY = 0;
    let startScroll = 0;

    thumb.addEventListener('mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      startScroll = scrollArea.scrollTop;
      thumb.classList.add('dragging');
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const trackH = track.clientHeight;
      const thumbH = thumb.offsetHeight;
      const maxTop = trackH - thumbH;
      const deltaPx = e.clientY - startY;
      const ratio = maxTop > 0 ? deltaPx / maxTop : 0;
      scrollArea.scrollTop = startScroll + ratio * (scrollArea.scrollHeight - scrollArea.clientHeight);
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        thumb.classList.remove('dragging');
      }
    });

    return { update };
  }

  window.CustomScrollbar = { attach };
})();
