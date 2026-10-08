export type ViewportTooltipPlacement = 'top' | 'bottom';

export interface TooltipRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportTooltipPosition {
  left: number;
  top: number;
  placement: ViewportTooltipPlacement;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
);

export const getViewportTooltipPosition = (
  anchor: TooltipRect,
  tooltip: TooltipSize,
  viewport: ViewportSize,
  preferredPlacement: ViewportTooltipPlacement = 'top',
  margin = 12,
  gap = 10
): ViewportTooltipPosition => {
  const width = Math.min(tooltip.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(tooltip.height, Math.max(0, viewport.height - margin * 2));
  const roomAbove = anchor.top - margin - gap;
  const roomBelow = viewport.height - margin - anchor.bottom - gap;

  let placement = preferredPlacement;
  if (preferredPlacement === 'top' && height > roomAbove && roomBelow > roomAbove) {
    placement = 'bottom';
  } else if (preferredPlacement === 'bottom' && height > roomBelow && roomAbove > roomBelow) {
    placement = 'top';
  }

  const centeredLeft = anchor.left + anchor.width / 2 - width / 2;
  const rawTop = placement === 'top'
    ? anchor.top - gap - height
    : anchor.bottom + gap;

  return {
    left: clamp(centeredLeft, margin, viewport.width - margin - width),
    top: clamp(rawTop, margin, viewport.height - margin - height),
    placement
  };
};
