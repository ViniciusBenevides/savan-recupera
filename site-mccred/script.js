/* MC Cred — interações e efeitos da landing */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------- preloader ---------- */
  var markLoaded = function () { document.body.classList.add("loaded"); };
  if (document.readyState === "complete") markLoaded();
  else window.addEventListener("load", markLoaded);
  setTimeout(markLoaded, 2200); /* nunca prender o visitante */

  /* ---------- nav ---------- */
  var nav = document.getElementById("nav");
  var progress = document.getElementById("scrollProgress");
  var onScrollNav = function () {
    nav.classList.toggle("scrolled", window.scrollY > 24);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (h > 0 ? window.scrollY / h : 0) + ")";
    }
  };
  onScrollNav();
  window.addEventListener("scroll", onScrollNav, { passive: true });

  var burger = document.getElementById("navBurger");
  var links = document.getElementById("navLinks");
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
  }

  /* ---------- cursor customizado ---------- */
  if (finePointer && !reduced) {
    var dot = document.getElementById("cursorDot");
    var ring = document.getElementById("cursorRing");
    var label = document.getElementById("cursorLabel");
    var mx = -100, my = -100, rx = -100, ry = -100, cursorOn = false;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;
      if (!cursorOn) { cursorOn = true; document.body.classList.add("has-cursor"); }
    });
    document.addEventListener("mouseleave", function () {
      cursorOn = false;
      document.body.classList.remove("has-cursor");
    });
    document.addEventListener("mousedown", function () { ring.classList.add("is-down"); });
    document.addEventListener("mouseup", function () { ring.classList.remove("is-down"); });

    var HOVER_SEL = "a, button, .chip, [data-cursor-text]";
    document.addEventListener("mouseover", function (e) {
      var t = e.target.closest(HOVER_SEL);
      if (!t) {
        ring.classList.remove("is-hover", "is-label");
        dot.classList.remove("is-hidden");
        label.textContent = "";
        return;
      }
      var txt = t.getAttribute("data-cursor-text");
      if (txt) {
        label.textContent = txt;
        ring.classList.add("is-label");
        ring.classList.remove("is-hover");
        dot.classList.add("is-hidden");
      } else {
        ring.classList.add("is-hover");
        ring.classList.remove("is-label");
        dot.classList.remove("is-hidden");
        label.textContent = "";
      }
    });

    (function cursorLoop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.left = mx + "px";
      dot.style.top = my + "px";
      ring.style.left = rx + "px";
      ring.style.top = ry + "px";
      requestAnimationFrame(cursorLoop);
    })();
  }

  /* ---------- botões magnéticos ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll(".magnetic").forEach(function (el) {
      var strength = 22;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
        var dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        el.style.transform = "translate(" + dx * strength * 0.4 + "px," + dy * strength * 0.3 + "px)";
      });
      el.addEventListener("mouseleave", function () {
        el.style.transition = "transform .5s cubic-bezier(.34,1.56,.64,1)";
        el.style.transform = "";
        setTimeout(function () { el.style.transition = ""; }, 500);
      });
    });
  }

  /* ---------- spotlight nos cards ---------- */
  if (finePointer) {
    document.querySelectorAll(".spot").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
  }

  /* ---------- tilt 3D no card principal ---------- */
  var tilt = document.getElementById("tiltCard");
  if (tilt && finePointer && !reduced) {
    var wrap = tilt.closest(".hero-visual");
    wrap.addEventListener("mousemove", function (e) {
      var r = wrap.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform =
        "translate(-50%,-50%) rotateY(" + px * 10 + "deg) rotateX(" + -py * 10 + "deg)";
    });
    wrap.addEventListener("mouseleave", function () {
      tilt.style.transition = "transform .7s cubic-bezier(.22,1,.36,1)";
      tilt.style.transform = "translate(-50%,-50%)";
      setTimeout(function () { tilt.style.transition = "transform .2s ease-out"; }, 700);
    });
  }

  /* ---------- partículas douradas (canvas) ---------- */
  var fx = document.getElementById("fx");
  if (fx && !reduced) {
    var ctx = fx.getContext("2d");
    var W, H, parts = [], dpr = Math.min(window.devicePixelRatio || 1, 2);
    var COUNT = window.innerWidth < 720 ? 26 : 60;
    var pmx = 0.5, pmy = 0.5;

    var resize = function () {
      var r = fx.parentElement.getBoundingClientRect();
      W = r.width;
      H = r.height;
      fx.width = W * dpr;
      fx.height = H * dpr;
      fx.style.width = W + "px";
      fx.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (var i = 0; i < COUNT; i++) {
      parts.push({
        x: Math.random(), y: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        s: 0.06 + Math.random() * 0.22,
        o: 0.15 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.12,
        tw: Math.random() * Math.PI * 2
      });
    }

    if (finePointer) {
      document.addEventListener("mousemove", function (e) {
        pmx = e.clientX / window.innerWidth;
        pmy = e.clientY / window.innerHeight;
      });
    }

    var visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(fx);
    }

    var t = 0;
    (function fxLoop() {
      requestAnimationFrame(fxLoop);
      if (!visible) return;
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= (p.s / H) * 1.6;
        p.x += (p.drift / W) * 1.6;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        var px = (p.x + (pmx - 0.5) * 0.03 * p.r) * W;
        var py = (p.y + (pmy - 0.5) * 0.03 * p.r) * H;
        var a = p.o * (0.55 + 0.45 * Math.sin(t * 1.4 + p.tw));
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232,184,75," + a.toFixed(3) + ")";
        ctx.shadowColor = "rgba(232,184,75,0.8)";
        ctx.shadowBlur = p.r * 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    })();
  }

  /* ---------- split text ---------- */
  var splitWordIndex;
  var splitNode = function (node) {
    if (node.nodeType === 3) {
      var frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(function (piece) {
        if (!piece) return;
        if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(" ")); return; }
        var w = document.createElement("span");
        w.className = "w";
        var inner = document.createElement("i");
        inner.textContent = piece;
        inner.style.setProperty("--wi", splitWordIndex++);
        w.appendChild(inner);
        frag.appendChild(w);
      });
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === 1) {
      Array.prototype.slice.call(node.childNodes).forEach(splitNode);
    }
  };
  document.querySelectorAll("[data-split]").forEach(function (el) {
    splitWordIndex = 0;
    Array.prototype.slice.call(el.childNodes).forEach(splitNode);
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal, .split");
  if (reduced || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in-view"); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- contadores ---------- */
  var animateCount = function (el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1600, start = null;
    var tick = function (ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString("pt-BR") + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (!reduced && "IntersectionObserver" in window) {
    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    document.querySelectorAll("[data-count]").forEach(function (el) { cio.observe(el); });
  }

  /* ---------- odômetro do hero ---------- */
  var odo = document.getElementById("odometer");
  if (odo && !reduced) {
    var value = 4280350;
    setInterval(function () {
      value += 180 + Math.floor(Math.random() * 2400);
      odo.textContent = value.toLocaleString("pt-BR");
    }, 3400);
  }

  /* ---------- feed ao vivo ---------- */
  var feed = document.getElementById("liveFeed");
  if (feed) {
    var IC_GOLD = '<span class="f-ic ic-gold"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#191307" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>';
    var IC_GREEN = '<span class="f-ic ic-green"><svg width="15" height="15" viewBox="0 0 24 24" fill="#06130b"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z"/></svg></span>';
    var IC_DARK = '<span class="f-ic ic-dark"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e8b84b" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M7 8c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5 1.3-5 3 2.2 3 5 3 5-1.3 5-3"/></svg></span>';
    var events = [
      { ic: IC_GREEN, h: "Acordo fechado no WhatsApp", p: "Quitação à vista com desconto", b: "R$ 2.340" },
      { ic: IC_GOLD, h: "Carteira avaliada", p: "Proposta enviada ao credor", b: "48h" },
      { ic: IC_DARK, h: "Pagamento confirmado", p: "Parcela 3 de 6 recebida", b: "R$ 410" },
      { ic: IC_GREEN, h: "Nome limpo 🎉", p: "Baixa registrada para o cliente", b: "hoje" },
      { ic: IC_GOLD, h: "Cessão formalizada", p: "Pagamento à vista ao credor", b: "R$ 96 mil" },
      { ic: IC_DARK, h: "Nova negociação iniciada", p: "Cliente respondeu à proposta", b: "agora" }
    ];
    var render = function (ev, enter) {
      var d = document.createElement("div");
      d.className = "feed-item" + (enter ? " enter" : "");
      d.innerHTML = ev.ic + "<div><h5>" + ev.h + "</h5><p>" + ev.p + "</p></div><b>" + ev.b + "</b>";
      return d;
    };
    var idx = 3;
    feed.appendChild(render(events[0]));
    feed.appendChild(render(events[1]));
    feed.appendChild(render(events[2]));
    if (!reduced) {
      setInterval(function () {
        var item = render(events[idx % events.length], true);
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 3) feed.removeChild(feed.lastChild);
        idx++;
      }, 3000);
    }
  }

  /* ---------- parallax das orbs ---------- */
  var pEls = document.querySelectorAll("[data-parallax]");
  if (pEls.length && !reduced) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        pEls.forEach(function (el) {
          el.style.transform = "translateY(" + y * parseFloat(el.getAttribute("data-parallax")) + "px)";
        });
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- carrossel arrastável ---------- */
  var car = document.getElementById("carousel");
  if (car && finePointer) {
    var isDown = false, startX = 0, startLeft = 0, moved = false;
    car.addEventListener("pointerdown", function (e) {
      isDown = true;
      moved = false;
      startX = e.clientX;
      startLeft = car.scrollLeft;
      car.setPointerCapture(e.pointerId);
    });
    car.addEventListener("pointermove", function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 6) { moved = true; car.classList.add("dragging"); }
      car.scrollLeft = startLeft - dx;
    });
    var release = function () {
      isDown = false;
      setTimeout(function () { car.classList.remove("dragging"); }, 50);
    };
    car.addEventListener("pointerup", release);
    car.addEventListener("pointercancel", release);
    car.addEventListener("click", function (e) { if (moved) e.preventDefault(); }, true);
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var btn = item.querySelector(".faq-q");
    var panel = item.querySelector(".faq-a");
    btn.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach(function (other) {
        other.classList.remove("open");
        other.querySelector(".faq-q").setAttribute("aria-expanded", "false");
        other.querySelector(".faq-a").style.maxHeight = "0px";
      });
      if (!isOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  });
})();
