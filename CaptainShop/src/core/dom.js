// Tiny render engine — replaces React + dc-runtime with ~120 lines of vanilla JS.
// Renders the UI to an HTML string, then *morphs* it onto the live DOM instead
// of replacing it, so CSS transitions (the reel spin), the <canvas> embers,
// running keyframe animations, and text-input focus survive a re-render.
window.App = window.App || {};
(function (App) {

  App.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  App.when = (cond, htmlStr) => cond ? htmlStr : '';
  App.each = (arr, fn) => arr.map(fn).join('');

  // Template indentation produces whitespace-only text nodes. Their count changes
  // whenever a conditional chunk toggles, which mis-aligns index-matched siblings
  // and forces moves that restart CSS animations/transitions mid-flight. Strip them.
  const isWsText = n => n.nodeType === 3 && !/\S/.test(n.nodeValue);
  function stripWs(node) {
    let c = node.firstChild;
    while (c) {
      const next = c.nextSibling;
      if (isWsText(c)) node.removeChild(c);
      else if (c.nodeType === 1) stripWs(c);
      c = next;
    }
  }

  function keyOf(node, idx) {
    if (node.nodeType === 1) {
      const k = node.getAttribute('data-key');
      if (k != null) return 'k:' + k;
    }
    return 'i:' + idx;
  }

  function morphAttrs(from, to) {
    const toAttrs = to.attributes;
    for (let i = 0; i < toAttrs.length; i++) {
      const a = toAttrs[i];
      if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    }
    const fromAttrs = from.attributes;
    for (let i = fromAttrs.length - 1; i >= 0; i--) {
      const name = fromAttrs[i].name;
      if (!to.hasAttribute(name)) from.removeAttribute(name);
    }
  }

  function morphNode(from, to) {
    if (from.nodeType === 3 || from.nodeType === 8) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    if (from.nodeType !== 1) return;
    morphAttrs(from, to);
    const tag = from.nodeName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const v = to.getAttribute('value');
      if (v != null && document.activeElement !== from && from.value !== v) from.value = v;
    }
    morphChildren(from, to);
  }

  function morphChildren(parent, newParent) {
    for (let c = parent.firstChild; c;) {
      const next = c.nextSibling;
      if (isWsText(c)) parent.removeChild(c);
      c = next;
    }
    const newNodes = Array.prototype.slice.call(newParent.childNodes);
    const oldByKey = new Map();
    Array.prototype.slice.call(parent.childNodes).forEach((n, i) => oldByKey.set(keyOf(n, i), n));

    const result = [];
    newNodes.forEach((nn, i) => {
      const k = keyOf(nn, i);
      const old = oldByKey.get(k);
      if (old && old.nodeType === nn.nodeType && old.nodeName === nn.nodeName) {
        oldByKey.delete(k);
        morphNode(old, nn);
        result.push(old);
      } else {
        result.push(nn);
      }
    });

    oldByKey.forEach(n => { if (n.parentNode === parent) parent.removeChild(n); });

    for (let i = 0; i < result.length; i++) {
      const desired = result[i];
      if (parent.childNodes[i] !== desired) parent.insertBefore(desired, parent.childNodes[i] || null);
    }
    while (parent.childNodes.length > result.length) parent.removeChild(parent.lastChild);
  }

  App.morphInto = function (container, htmlString) {
    const tmp = document.createElement(container.tagName || 'div');
    tmp.innerHTML = htmlString;
    stripWs(tmp);
    morphChildren(container, tmp);
  };

  App.createRenderer = function (container, renderFn) {
    let queued = false;
    function flush() { queued = false; App.morphInto(container, renderFn()); }
    return function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(flush);
    };
  };

})(window.App);
