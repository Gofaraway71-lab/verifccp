/**
 * Synthétiseur de signaux sonores local basé sur l'API Web Audio standard.
 * Fonctionne 100% hors-ligne sans aucun fichier audio externe.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Joue une tonalité discrète selon la gravité de l'alerte.
 */
export function playAudioAlert(type: 'critical' | 'warning' | 'success' | 'info', isMuted = false): void {
  if (isMuted || typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'critical') {
      // Double bip d'urgence doux et net : 580 Hz puis 880 Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.setValueAtTime(880, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'success') {
      // Carillon d'accordage harmonieux : C5 -> E5
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.08);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.24);

      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'warning') {
      // Bip d'avertissement simple
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    // Échec silencieux si le navigateur bloque l'audio sans interaction
  }
}
