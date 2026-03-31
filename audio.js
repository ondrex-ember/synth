// ==========================================
// SYSTEMIC SYNTHESIS — AUDIO MODULE v1.0
// Web Audio API only. Zero external files.
//
// Sounds:
//   clang()        — rot threshold alert (75%)
//   chime()        — fragment extraction complete
//   steamWhistle() — cascade collapse
// ==========================================

const Audio = (() => {
    let ctx = null;
    let enabled = true;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // ── UTILITY ───────────────────────────────────────────────────────────────
    function gain(ac, val, time) {
        const g = ac.createGain();
        g.gain.setValueAtTime(val, time);
        return g;
    }

    function connect(...nodes) {
        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].connect(nodes[i + 1]);
        }
    }

    // ── CLANG — rot threshold 75% ─────────────────────────────────────────────
    // Metalický industriální úder. Krátký attack, středně dlouhý decay.
    // Evokuje kovový narážení páry / tlaku v továrně.
    function clang() {
        if (!enabled) return;
        const ac  = getCtx();
        const now = ac.currentTime;

        // Primary strike — low metallic thud
        const osc1 = ac.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(180, now);
        osc1.frequency.exponentialRampToValueAtTime(60, now + 0.18);

        const g1 = ac.createGain();
        g1.gain.setValueAtTime(0.0, now);
        g1.gain.linearRampToValueAtTime(0.32, now + 0.005);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        // High harmonic ring — metallic overtone
        const osc2 = ac.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(820, now);
        osc2.frequency.exponentialRampToValueAtTime(340, now + 0.3);

        const g2 = ac.createGain();
        g2.gain.setValueAtTime(0.0, now);
        g2.gain.linearRampToValueAtTime(0.12, now + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        // Noise burst — initial impact
        const bufSize   = ac.sampleRate * 0.06;
        const noiseBuf  = ac.createBuffer(1, bufSize, ac.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) noiseData[i] = (Math.random() * 2 - 1);
        const noise = ac.createBufferSource();
        noise.buffer = noiseBuf;

        const noiseFilter = ac.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 400;
        noiseFilter.Q.value = 0.8;

        const gn = ac.createGain();
        gn.gain.setValueAtTime(0.18, now);
        gn.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        // Master gain
        const master = ac.createGain();
        master.gain.value = 0.7;

        connect(osc1, g1, master, ac.destination);
        connect(osc2, g2, master);
        connect(noise, noiseFilter, gn, master);

        osc1.start(now); osc1.stop(now + 0.6);
        osc2.start(now); osc2.stop(now + 0.7);
        noise.start(now); noise.stop(now + 0.08);
    }

    // ── CHIME — fragment extraction complete ──────────────────────────────────
    // Dvě čisté sinusové vlny v intervalech. Evokuje starou burzovní gongu.
    // Jemný, jasný — kontrast k temnému vizuálu.
    function chime() {
        if (!enabled) return;
        const ac  = getCtx();
        const now = ac.currentTime;

        const notes = [
            { freq: 1046.5, delay: 0,    dur: 1.2, vol: 0.18 },  // C6
            { freq: 1318.5, delay: 0.12, dur: 1.0, vol: 0.13 },  // E6
            { freq: 1568.0, delay: 0.24, dur: 0.9, vol: 0.10 },  // G6
        ];

        notes.forEach(({ freq, delay, dur, vol }) => {
            const osc = ac.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            // Slight frequency shimmer — old bell quality
            osc.frequency.setValueAtTime(freq * 1.003, now + delay);
            osc.frequency.exponentialRampToValueAtTime(freq, now + delay + 0.05);

            const g = ac.createGain();
            g.gain.setValueAtTime(0.0, now + delay);
            g.gain.linearRampToValueAtTime(vol, now + delay + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);

            osc.connect(g);
            g.connect(ac.destination);
            osc.start(now + delay);
            osc.stop(now + delay + dur + 0.05);
        });
    }

    // ── STEAM WHISTLE — cascade collapse ─────────────────────────────────────
    // Vzdálená parní píšťala. Rychlý náběh, vibrato, pomalý fade.
    // Evokuje průmyslový alarm v dáli — systém kolabuje.
    function steamWhistle() {
        if (!enabled) return;
        const ac  = getCtx();
        const now = ac.currentTime;

        // Main whistle tone
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(540, now + 0.08);
        osc.frequency.setValueAtTime(540, now + 0.08);
        osc.frequency.linearRampToValueAtTime(530, now + 0.5);
        osc.frequency.exponentialRampToValueAtTime(480, now + 2.0);

        // Vibrato LFO
        const lfo = ac.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5.5;

        const lfoGain = ac.createGain();
        lfoGain.gain.value = 6;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        // Steam noise layer
        const bufSize   = ac.sampleRate * 2.2;
        const noiseBuf  = ac.createBuffer(1, bufSize, ac.sampleRate);
        const noiseData = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) noiseData[i] = (Math.random() * 2 - 1);
        const noise = ac.createBufferSource();
        noise.buffer = noiseBuf;

        const noiseFilter = ac.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 900;

        const gn = ac.createGain();
        gn.gain.setValueAtTime(0.06, now);
        gn.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

        // Distance filter — lowpass simulates distance
        const distFilter = ac.createBiquadFilter();
        distFilter.type = 'lowpass';
        distFilter.frequency.value = 1800;
        distFilter.Q.value = 0.5;

        // Master envelope
        const master = ac.createGain();
        master.gain.setValueAtTime(0.0, now);
        master.gain.linearRampToValueAtTime(0.22, now + 0.06);
        master.gain.setValueAtTime(0.22, now + 0.4);
        master.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

        connect(osc, distFilter, master, ac.destination);
        connect(noise, noiseFilter, gn, distFilter);

        lfo.start(now);     lfo.stop(now + 2.3);
        osc.start(now);     osc.stop(now + 2.3);
        noise.start(now);   noise.stop(now + 2.2);
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────────
    return {
        clang,
        chime,
        steamWhistle,
        enable()  { enabled = true; },
        disable() { enabled = false; },
        toggle()  { enabled = !enabled; return enabled; },
        isEnabled() { return enabled; },
        // Warm up AudioContext on first user interaction
        init() { try { getCtx(); } catch(e) {} }
    };
})();