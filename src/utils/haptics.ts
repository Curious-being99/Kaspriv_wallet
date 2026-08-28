/**
 * Native Haptic Feedback Utility for Mobile & Touch Interactions
 * Uses standard Navigator Vibration API with custom haptic vibration patterns
 * and automated pointer event delegation for tactile feedback on buttons.
 */

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 22,
  heavy: 40,
  selection: 8,
  success: [15, 40, 20],
  warning: [25, 35, 25],
  error: [35, 45, 35, 45, 35],
};

let isHapticFeedbackEnabled = true;

// Check stored preference if present
try {
  const stored = localStorage.getItem('kaspriv_haptics_enabled');
  if (stored !== null) {
    isHapticFeedbackEnabled = stored === 'true';
  }
} catch {
  // Ignore storage access errors
}

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function';
}

export function getHapticsEnabled(): boolean {
  return isHapticFeedbackEnabled;
}

export function setHapticsEnabled(enabled: boolean): void {
  isHapticFeedbackEnabled = enabled;
  try {
    localStorage.setItem('kaspriv_haptics_enabled', String(enabled));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Triggers a designated haptic pattern safely
 */
export function triggerHaptic(type: HapticType = 'light'): boolean {
  if (!isHapticFeedbackEnabled) return false;
  if (!isHapticsSupported()) return false;

  try {
    const pattern = HAPTIC_PATTERNS[type] || 10;
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

// Shorthand helpers
export const hapticLight = () => triggerHaptic('light');
export const hapticMedium = () => triggerHaptic('medium');
export const hapticHeavy = () => triggerHaptic('heavy');
export const hapticSelection = () => triggerHaptic('selection');
export const hapticSuccess = () => triggerHaptic('success');
export const hapticWarning = () => triggerHaptic('warning');
export const hapticError = () => triggerHaptic('error');

let isInitialized = false;

/**
 * Attaches a lightweight, passive global event listener to capture button taps
 * and immediately trigger haptic feedback without modifying existing click handlers.
 */
export function initGlobalHaptics(): () => void {
  if (isInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  isInitialized = true;

  const handlePointerDown = (event: PointerEvent | TouchEvent) => {
    try {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Find closest interactive button or element
      const interactiveEl = target.closest('button, [role="button"], input[type="button"], input[type="submit"], [data-haptic]');
      if (!interactiveEl) return;

      // Check if disabled or opted out
      if (
        interactiveEl.hasAttribute('disabled') ||
        interactiveEl.getAttribute('aria-disabled') === 'true' ||
        interactiveEl.getAttribute('data-no-haptic') === 'true'
      ) {
        return;
      }

      const explicitHaptic = interactiveEl.getAttribute('data-haptic') as HapticType | null;
      if (explicitHaptic && HAPTIC_PATTERNS[explicitHaptic]) {
        triggerHaptic(explicitHaptic);
      } else {
        triggerHaptic('light');
      }
    } catch {
      // Safe fallback
    }
  };

  // Use passive pointerdown for ultra-low latency response
  document.addEventListener('pointerdown', handlePointerDown, { passive: true, capture: true });

  return () => {
    document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    isInitialized = false;
  };
}
