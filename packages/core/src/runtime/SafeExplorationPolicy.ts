import type { SemanticElement, UiAction, UiActionDecision } from './types.js';

export class SafeExplorationPolicy {
  classify(action: UiAction): UiActionDecision {
    const element = action.element;
    if (!element) return { risk: 'SAFE', reasons: ['non-element navigation action'] };

    const text = this.contextText(element);
    const reasons: string[] = [];

    if (element.destructiveHint || /\b(delete|drop|purge|destroy|remove account|close account|rotate credential)\b/i.test(text)) {
      reasons.push('destructive action context');
      return { risk: 'FORBIDDEN', reasons };
    }

    if (/\b(real purchase|buy now|pay|checkout|deploy production|publish|send email|invite users?)\b/i.test(text)) {
      reasons.push('external or persistent side effect context');
      return { risk: 'FORBIDDEN', reasons };
    }

    if (element.externalWriteHint || /\b(create|save|update|submit|post|upload|send|publish)\b/i.test(text)) {
      reasons.push('persistent write may occur');
      return { risk: 'REVIEW_REQUIRED', reasons };
    }

    if (action.kind === 'type' || action.kind === 'select') {
      reasons.push('safe form interaction without submit');
      return { risk: 'SAFE', reasons };
    }

    reasons.push('navigation or read-only control');
    return { risk: 'SAFE', reasons };
  }

  private contextText(element: SemanticElement): string {
    return [
      element.role,
      element.accessibleName,
      element.nearbyText,
      element.route,
      element.formAction,
      element.destination,
    ].filter(Boolean).join(' ');
  }
}
