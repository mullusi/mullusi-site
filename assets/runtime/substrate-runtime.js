/*
Purpose: operate the Mullusi homepage canvas substrate runtime.
Governance scope: canvas substrate initialization, reduced-motion fallback, theme-aware palette updates, scroll-driven field state, and performance throttling.
Dependencies: assets/runtime/page-runtime.js, DOM canvas APIs, matchMedia, requestAnimationFrame, and browser resize/scroll events.
Invariants: substrate rendering is optional, reduced motion produces a static field, theme changes update palettes through explicit events, and performance degradation falls back to bounded rendering.
*/

(() => {
  function pageRuntime() {
    if (!window.MullusiPageRuntime) {
      throw new Error("Page runtime module is unavailable.");
    }
    return window.MullusiPageRuntime;
  }

  function initSubstrate(context = {}) {
    const qs = typeof context.qs === "function" ? context.qs : pageRuntime().qs;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lat = qs("#c-lattice");
    const wav = qs("#c-wave");
    const chn = qs("#c-chain");
    if (!lat || !wav || !chn) return;

    const lx = lat.getContext("2d");
    const wx = wav.getContext("2d");
    const cx = chn.getContext("2d");
    const readout = qs("#resonance-readout");
    if (!lx || !wx || !cx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cellSize = 68;
    let cols = 0;
    let rows = 0;
    let energy = new Float32Array(0);
    let particles = [];
    let waves = [];
    let randomState = 0x6d756c6c;
    const fidels = ["ሙ", "ሉ", "ሊ", "ሰ", "መ", "ለ", "ኡ", "ኢ", "ኣ", "ፊ", "ደ", "ል"];

    const zones = [
      {
        id: "Σ",
        at: 0,
        rgb: [92, 230, 196],
        node: [60, 68, 92],
        pRate: 1,
        pSpeed: 1,
        pMax: 4,
        waveMax: 3.4,
        waveOn: 1,
        mesh: 0,
        trail: 0,
        decay: 0.965,
        drift: 0,
        latAlpha: 1,
      },
      {
        id: "Λ",
        at: 0.5,
        rgb: [232, 177, 92],
        node: [86, 78, 58],
        pRate: 0.45,
        pSpeed: 0.55,
        pMax: 3,
        waveMax: 2.8,
        waveOn: 0.7,
        mesh: 1,
        trail: 0,
        decay: 0.95,
        drift: 0,
        latAlpha: 1,
      },
      {
        id: "H",
        at: 1,
        rgb: [122, 165, 232],
        node: [52, 60, 90],
        pRate: 0.5,
        pSpeed: 0.4,
        pMax: 4,
        waveMax: 2.4,
        waveOn: 0.15,
        mesh: 0.2,
        trail: 0.9,
        decay: 0.985,
        drift: 1,
        latAlpha: 0.55,
      },
    ];

    const zone = {
      id: "Σ",
      rgb: [92, 230, 196],
      node: [60, 68, 92],
      pRate: 1,
      pSpeed: 1,
      pMax: 4,
      waveMax: 3.4,
      waveOn: 1,
      mesh: 0,
      trail: 0,
      decay: 0.965,
      drift: 0,
      latAlpha: 1,
    };

    const themePalettes = {
      dark: [
        { rgb: [92, 230, 196], node: [60, 68, 92] },
        { rgb: [232, 177, 92], node: [86, 78, 58] },
        { rgb: [122, 165, 232], node: [52, 60, 90] },
      ],
      light: [
        { rgb: [20, 124, 111], node: [128, 139, 152] },
        { rgb: [154, 100, 27], node: [150, 136, 112] },
        { rgb: [76, 100, 150], node: [118, 128, 148] },
      ],
    };

    let activeSubstrateTheme = "";

    function applySubstrateTheme() {
      const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      if (theme === activeSubstrateTheme) return;
      activeSubstrateTheme = theme;
      themePalettes[theme].forEach((palette, index) => {
        zones[index].rgb = [...palette.rgb];
        zones[index].node = [...palette.node];
      });
    }

    const ease = (value) => value * value * value * (value * (value * 6 - 15) + 10);
    const accent = (alpha) => `rgba(${zone.rgb[0] | 0},${zone.rgb[1] | 0},${zone.rgb[2] | 0},${alpha})`;
    const nodeColor = (alpha) => `rgba(${zone.node[0] | 0},${zone.node[1] | 0},${zone.node[2] | 0},${alpha})`;

    let scrollFrac = 0;
    let scrollTarget = 0;
    let frame = 0;
    let sigma = 0;
    let perfTier = 0;
    let lastTime = performance.now();
    let slowStreak = 0;
    let fastStreak = 0;
    let throttleSkip = false;
    let staticDrawn = false;
    let motionLastTime = performance.now();

    function readScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTarget = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }

    function frameFactor(timestamp) {
      const elapsed = timestamp - motionLastTime;
      motionLastTime = timestamp;
      if (!Number.isFinite(elapsed) || elapsed <= 0) return 1;
      return Math.min(2.25, Math.max(0.35, elapsed / 16.667));
    }

    function easeFrame(base, factor) {
      return 1 - Math.pow(1 - base, factor);
    }

    function updateZone(deltaFactor) {
      scrollFrac += (scrollTarget - scrollFrac) * easeFrame(0.06, deltaFactor);
      const fraction = scrollFrac;
      let lowerIndex = 0;
      while (lowerIndex < zones.length - 2 && fraction > zones[lowerIndex + 1].at) {
        lowerIndex += 1;
      }
      const lower = zones[lowerIndex];
      const upper = zones[lowerIndex + 1];
      const span = upper.at - lower.at;
      const local = span > 0 ? (fraction - lower.at) / span : 0;
      const k = ease(Math.min(1, Math.max(0, local)));
      const mix = (a, b) => a + (b - a) * k;

      for (let index = 0; index < 3; index += 1) {
        zone.rgb[index] = mix(lower.rgb[index], upper.rgb[index]);
        zone.node[index] = mix(lower.node[index], upper.node[index]);
      }

      zone.pRate = mix(lower.pRate, upper.pRate);
      zone.pSpeed = mix(lower.pSpeed, upper.pSpeed);
      zone.pMax = mix(lower.pMax, upper.pMax);
      zone.waveMax = mix(lower.waveMax, upper.waveMax);
      zone.waveOn = mix(lower.waveOn, upper.waveOn);
      zone.mesh = mix(lower.mesh, upper.mesh);
      zone.trail = mix(lower.trail, upper.trail);
      zone.decay = mix(lower.decay, upper.decay);
      zone.drift = mix(lower.drift, upper.drift);
      zone.latAlpha = mix(lower.latAlpha, upper.latAlpha);
      zone.id = k < 0.5 ? lower.id : upper.id;
    }

    function zoneIntensity(center) {
      const distance = Math.abs(scrollFrac - center);
      return Math.max(0, Math.min(1, 1 - distance / 0.48));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      [lat, wav, chn].forEach((canvas) => {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      cols = Math.ceil(width / cellSize) + 1;
      rows = Math.ceil(height / cellSize) + 1;
      energy = new Float32Array(cols * rows);
    }

    function randomUnit() {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    }

    function spawnParticle() {
      const lane = Math.floor(randomUnit() * rows);
      particles.push({
        x: randomUnit() * Math.max(width, 1),
        y: randomUnit() * Math.max(height, 1),
        vx: (randomUnit() - 0.5) * 0.18,
        vy: (randomUnit() - 0.5) * 0.12,
        lane,
        phase: randomUnit() * Math.PI * 2,
        radius: 64 + randomUnit() * 120,
        pulse: randomUnit() * 320,
        pulseEvery: 320 + randomUnit() * 360,
        sides: 4 + Math.floor(randomUnit() * 4),
        spin: (0.002 + randomUnit() * 0.004) * (randomUnit() > 0.5 ? 1 : -1),
      });
    }

    function wrapFieldObject(fieldObject) {
      const pad = fieldObject.radius + 40;
      if (fieldObject.x < -pad) fieldObject.x = width + pad;
      if (fieldObject.x > width + pad) fieldObject.x = -pad;
      if (fieldObject.y < -pad) fieldObject.y = height + pad;
      if (fieldObject.y > height + pad) fieldObject.y = -pad;
    }

    function feedEnergyAt(x, y, amount) {
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;
      const index = row * cols + col;
      energy[index] = Math.min(1, energy[index] + amount);
    }

    function drawSmoke(fieldObject, alphaScale, time) {
      if (alphaScale <= 0.01) return;
      const radius = fieldObject.radius * (0.82 + Math.sin(fieldObject.phase + time * 0.25) * 0.08);
      const x = fieldObject.x + Math.sin(fieldObject.phase * 0.7) * 18;
      const y = fieldObject.y + Math.cos(fieldObject.phase * 0.9) * 14;
      const gradient = cx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, accent((0.038 * alphaScale).toFixed(3)));
      gradient.addColorStop(0.52, accent((0.017 * alphaScale).toFixed(3)));
      gradient.addColorStop(1, accent(0));

      cx.save();
      cx.globalCompositeOperation = "lighter";
      cx.filter = "blur(10px)";
      cx.fillStyle = gradient;
      cx.beginPath();
      cx.ellipse(
        x,
        y,
        radius * 1.45,
        radius * 0.42,
        fieldObject.phase * 0.35,
        0,
        Math.PI * 2,
      );
      cx.fill();
      cx.restore();
    }

    function drawMorph(fieldObject, alphaScale, time) {
      if (alphaScale <= 0.01) return;
      const size = fieldObject.radius * 0.36;
      const sides = fieldObject.sides;
      const basePhase = fieldObject.phase + time * fieldObject.spin * 60;

      cx.save();
      cx.globalCompositeOperation = "lighter";
      cx.lineWidth = 1;
      cx.strokeStyle = accent((0.075 * alphaScale).toFixed(3));
      cx.fillStyle = accent((0.015 * alphaScale).toFixed(3));
      cx.beginPath();
      for (let index = 0; index < sides; index += 1) {
        const angle = basePhase + index * Math.PI * 2 / sides;
        const radius = size * (0.82 + Math.sin(basePhase * 0.9 + index * 1.7) * 0.24);
        const x = fieldObject.x + Math.cos(angle) * radius;
        const y = fieldObject.y + Math.sin(angle) * radius;
        if (index === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.closePath();
      cx.fill();
      cx.stroke();
      cx.restore();
    }

    function drawWaveBands(alphaScale, time) {
      if (alphaScale <= 0.01) return;
      wx.save();
      wx.globalCompositeOperation = "lighter";
      wx.lineWidth = 1;
      for (let band = 0; band < 2; band += 1) {
        const baseY = height * (0.3 + band * 0.24);
        const amplitude = 13 + band * 8;
        wx.strokeStyle = accent((0.026 * alphaScale * (1 - band * 0.12)).toFixed(3));
        wx.beginPath();
        for (let x = -24; x <= width + 24; x += 32) {
          const y = baseY
            + Math.sin(x * 0.008 + time * (0.18 + band * 0.04) + band * 1.7) * amplitude
            + Math.sin(x * 0.017 - time * 0.13) * 5;
          if (x === -24) wx.moveTo(x, y);
          else wx.lineTo(x, y);
        }
        wx.stroke();
      }
      wx.restore();
    }

    function drawStatic() {
      lx.clearRect(0, 0, width, height);
      wx.clearRect(0, 0, width, height);
      cx.clearRect(0, 0, width, height);
      for (let row = 0; row < rows; row += 2) {
        for (let col = 0; col < cols; col += 2) {
          lx.fillStyle = "rgba(60,68,92,.24)";
          lx.fillRect(col * cellSize - 0.5, row * cellSize - 0.5, 1, 1);
        }
      }
      if (readout) readout.textContent = "Σ 0.000";
    }

    function governPerf(now) {
      let delta = now - lastTime;
      lastTime = now;
      if (frame < 30) return;
      if (delta > 80) delta = 80;
      if (delta > 34) {
        slowStreak += 1;
        fastStreak = 0;
        if (perfTier === 0 && slowStreak > 36) {
          perfTier = 1;
          slowStreak = 0;
        } else if (perfTier === 1 && slowStreak > 80) {
          perfTier = 2;
          slowStreak = 0;
        }
        return;
      }

      fastStreak += 1;
      slowStreak = 0;
      if (perfTier === 1 && fastStreak > 260) {
        perfTier = 0;
        fastStreak = 0;
      }
    }

    function governStatic(renderCost) {
      if (renderCost < 22) {
        fastStreak += 1;
        if (fastStreak > 12) {
          perfTier = 1;
          fastStreak = 0;
          slowStreak = 0;
        }
        return;
      }
      fastStreak = 0;
    }

    function drawFrame(timestamp = performance.now()) {
      frame += 1;
      const renderStart = performance.now();
      const deltaFactor = frameFactor(timestamp);
      applySubstrateTheme();
      updateZone(deltaFactor);
      const time = timestamp * 0.001;
      const smokeWeight = zoneIntensity(0);
      const waveWeight = zoneIntensity(0.5);
      const morphWeight = zoneIntensity(1);

      const energyDecay = Math.pow(zone.decay, deltaFactor);
      for (let index = 0; index < energy.length; index += 1) {
        energy[index] *= energyDecay;
      }

      cx.globalCompositeOperation = "destination-out";
      cx.fillStyle = `rgba(0,0,0,${(0.045 + waveWeight * 0.035 + smokeWeight * 0.02).toFixed(3)})`;
      cx.fillRect(0, 0, width, height);
      cx.globalCompositeOperation = "source-over";

      const cap = Math.round(4 + smokeWeight * 2 + waveWeight * 1 + morphWeight * 2);
      while (particles.length < cap) {
        spawnParticle();
      }
      if (particles.length > cap + 4) particles.length = cap + 4;

      cx.lineCap = "round";
      cx.lineJoin = "round";
      for (const particle of particles) {
        particle.phase += (0.006 + morphWeight * 0.004) * deltaFactor;
        particle.x += (particle.vx + Math.sin(particle.phase * 0.37) * 0.035) * deltaFactor * (1 + smokeWeight * 0.7);
        particle.y += (particle.vy + Math.cos(particle.phase * 0.31) * 0.028) * deltaFactor * (1 + morphWeight * 0.55);
        wrapFieldObject(particle);

        particle.pulse += deltaFactor;
        if (particle.pulse >= particle.pulseEvery) {
          particle.pulse = 0;
          if (waves.length > 10) waves.shift();
          waves.push({
            x: particle.x,
            y: particle.y,
            r: 0,
            max: cellSize * zone.waveMax * (0.82 + waveWeight * 0.36),
          });
          feedEnergyAt(particle.x, particle.y, 0.18 + waveWeight * 0.12);
        }

        drawSmoke(particle, smokeWeight * 0.68 + waveWeight * 0.12, time);
        drawMorph(particle, morphWeight * 0.58 + waveWeight * 0.14, time);
      }

      wx.clearRect(0, 0, width, height);
      drawWaveBands(waveWeight * 0.64 + smokeWeight * 0.12, time);
      let totalEnergy = 0;
      let energyCount = 0;

      for (const wave of waves) {
        wave.r += 1.15 * deltaFactor;
        const progress = wave.r / wave.max;
        const alpha = (1 - progress) * 0.3 * zone.waveOn;
        if (alpha <= 0.002) continue;

        wx.strokeStyle = accent(alpha.toFixed(3));
        wx.lineWidth = 1;
        wx.beginPath();
        wx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        wx.stroke();

        const ringCol = Math.floor(wave.x / cellSize);
        const row = Math.floor(wave.y / cellSize);
        if (row >= 0 && row < rows && ringCol >= 0 && ringCol < cols) {
          const energyIndex = row * cols + ringCol;
          energy[energyIndex] = Math.min(1, energy[energyIndex] + alpha * 0.026);
        }
      }

      waves = waves.filter((wave) => wave.r < wave.max);

      lx.clearRect(0, 0, width, height);
      lx.globalAlpha = zone.latAlpha;

      if (zone.mesh > 0.02) {
        lx.lineWidth = 1;
        for (let row = 0; row < rows; row += 2) {
          for (let col = 0; col < cols; col += 2) {
            const value = energy[row * cols + col];
            if (value < 0.18) continue;
            const x = col * cellSize;
            const y = row * cellSize;
            const rightValue = col + 1 < cols ? energy[row * cols + col + 1] : 0;
            const downValue = row + 1 < rows ? energy[(row + 1) * cols + col] : 0;
            if (rightValue > 0.18) {
              lx.strokeStyle = accent((Math.min(value, rightValue) * 0.22 * zone.mesh).toFixed(3));
              lx.beginPath();
              lx.moveTo(x, y);
              lx.lineTo(x + cellSize, y);
              lx.stroke();
            }
            if (downValue > 0.18) {
              lx.strokeStyle = accent((Math.min(value, downValue) * 0.22 * zone.mesh).toFixed(3));
              lx.beginPath();
              lx.moveTo(x, y);
              lx.lineTo(x, y + cellSize);
              lx.stroke();
            }
          }
        }
      }

      for (let row = 0; row < rows; row += 2) {
        for (let col = 0; col < cols; col += 2) {
          const value = energy[row * cols + col];
          totalEnergy += value;
          energyCount += 1;
          const x = col * cellSize;
          const y = row * cellSize;
          lx.fillStyle = nodeColor((0.12 + value * 0.22).toFixed(3));
          lx.fillRect(x - 0.5, y - 0.5, 1, 1);

          if (value > 0.04) {
            lx.strokeStyle = accent((value * 0.105).toFixed(3));
            lx.lineWidth = 1;
            lx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
          }

          if (value > 0.62 && (row * 7 + col) % 5 === 0) {
            lx.fillStyle = accent((value * 0.26).toFixed(3));
            lx.font = '13px "Newsreader", serif';
            lx.fillText(fidels[(row * 3 + col) % fidels.length], x + cellSize / 2 - 6, y + cellSize / 2 + 5);
          }
        }
      }

      lx.globalAlpha = 1;

      const meanEnergy = energyCount ? totalEnergy / energyCount : 0;
      sigma += (meanEnergy - sigma) * easeFrame(0.05, deltaFactor);
      if (readout && frame % 12 === 0) {
        readout.textContent = `${zone.id} ${(sigma * 9).toFixed(3)}`;
      }

      const now = performance.now();
      governPerf(now);
      if (perfTier === 2) {
        if (!staticDrawn) {
          drawStatic();
          staticDrawn = true;
        }
        governStatic(now - renderStart);
        setTimeout(() => requestAnimationFrame(drawFrame), 200);
        return;
      }

      staticDrawn = false;
      if (perfTier === 0) {
        throttleSkip = !throttleSkip;
        if (throttleSkip) {
          setTimeout(() => requestAnimationFrame(drawFrame), 16);
          return;
        }
      }

      if (perfTier === 1) {
        throttleSkip = !throttleSkip;
        if (throttleSkip) {
          setTimeout(() => requestAnimationFrame(drawFrame), 48);
          return;
        }
      }

      requestAnimationFrame(drawFrame);
    }

    resize();
    applySubstrateTheme();
    for (let index = 0; index < 5; index += 1) spawnParticle();
    window.addEventListener("mullusi-theme-change", applySubstrateTheme);
    window.addEventListener("resize", () => {
      resize();
      if (reduce || perfTier === 2) drawStatic();
    });
    window.addEventListener("scroll", readScroll, { passive: true });

    if (reduce) {
      drawStatic();
      document.body.classList.add("substrate-ready");
      return;
    }

    readScroll();
    scrollFrac = scrollTarget;
    document.body.classList.add("substrate-ready");
    requestAnimationFrame(drawFrame);
  }

  window.MullusiSubstrateRuntime = Object.freeze({
    initSubstrate,
  });
})();
