/**
 * Browser-side runtime injected into every compiled document. It is part of the trusted
 * application bundle (never user supplied) and is the only script allowed by the page CSP.
 *
 * Determinism: all motion is expressed as CSS animations. `seek(t)` pauses each animation and
 * sets its `currentTime` to the scene-local time, so a frame is a pure function of `t` and does
 * not depend on wall-clock time, rAF timing or load order.
 */
export const RUNTIME_SOURCE = `
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('ff-data').textContent || '{}');
  var scenes = Array.prototype.slice.call(document.querySelectorAll('.ff-scene'));
  var caps = document.getElementById('ff-captions');
  var lastT = 0;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function seekAnimations(el, local) {
    var list = [];
    try { list = document.getAnimations(); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var target = a.effect && a.effect.target;
      if (!target) continue;
      var owner = target.closest ? target.closest('.ff-scene') : null;
      if (!owner) {
        var root = target.getRootNode && target.getRootNode();
        owner = root && root.host && root.host.closest ? root.host.closest('.ff-scene') : null;
      }
      if (owner !== el) continue;
      a.pause();
      a.currentTime = local;
    }
  }

  function transitionStyle(type, p, incoming) {
    // p: 0..1 progress of the transition. Returns [opacity, transform, clipPath].
    var q = incoming ? p : 1 - p;
    switch (type) {
      case 'fade': return incoming ? [p, '', ''] : [1, '', ''];
      case 'slideLeft': return incoming ? [1, 'translateX(' + ((1 - p) * 100) + '%)', ''] : [1, 'translateX(' + (-p * 100) + '%)', ''];
      case 'slideRight': return incoming ? [1, 'translateX(' + (-(1 - p) * 100) + '%)', ''] : [1, 'translateX(' + (p * 100) + '%)', ''];
      case 'slideUp': return incoming ? [1, 'translateY(' + ((1 - p) * 100) + '%)', ''] : [1, 'translateY(' + (-p * 100) + '%)', ''];
      case 'wipe': return incoming ? [1, '', 'inset(0 ' + ((1 - p) * 100) + '% 0 0)'] : [1, '', ''];
      default: return [1, '', ''];
    }
  }

  function seek(t) {
    lastT = t;
    var info = data.scenes || [];
    for (var i = 0; i < scenes.length; i++) {
      var s = info[i];
      var el = scenes[i];
      var local = t - s.start;
      var visible = local >= 0 && t < s.end;
      var next = info[i + 1];
      var inOutgoing = next && next.overlap > 0 && t >= next.start && t < next.start + next.overlap;
      var style = [1, '', ''];
      if (visible && s.overlap > 0 && local < s.overlap) {
        style = transitionStyle(s.transition, clamp01(local / s.overlap), true);
      } else if (visible && inOutgoing) {
        style = transitionStyle(next.transition, clamp01((t - next.start) / next.overlap), false);
      }
      el.style.display = visible ? 'block' : 'none';
      el.style.opacity = String(style[0]);
      el.style.transform = style[1];
      el.style.clipPath = style[2];
      if (visible) seekAnimations(el, Math.max(0, local));
    }
    if (caps) {
      var text = '';
      var items = data.captions || [];
      for (var c = 0; c < items.length; c++) {
        if (t >= items[c].start && t < items[c].end) { text = items[c].text; break; }
      }
      caps.textContent = text;
      caps.style.display = text ? 'block' : 'none';
    }
    void document.body.offsetWidth;
  }

  function ready() {
    var imgs = Array.prototype.slice.call(document.images).map(function (img) {
      return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all(imgs.concat([fonts])).then(function () { return true; });
  }

  window.__ff = { seek: seek, ready: ready, totalMs: data.totalMs || 0 };
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent && e.source !== window) return;
    var m = e.data;
    if (m && m.type === 'ff-seek' && typeof m.t === 'number' && isFinite(m.t)) seek(m.t);
  });
  seek(0);
  if (window.parent !== window) window.parent.postMessage({ type: 'ff-ready', totalMs: data.totalMs || 0 }, '*');
})();
`;
