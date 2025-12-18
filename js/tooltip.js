// Tooltip System with 1.5-second hover delay
class TooltipManager {
  constructor() {
    this.currentTooltip = null;
    this.hoverTimer = null;
    this.HOVER_DELAY = 750;
    this.init();
  }

  init() {
    // Add tooltip on mouseover for any element with data-tooltip
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        this.startHoverTimer(target);
      }
    });

    // Remove tooltip on mouseout
    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        this.cancelHoverTimer();
        this.hideTooltip();
      }
    });

    // Hide tooltip when scrolling
    document.addEventListener('scroll', () => {
      this.hideTooltip();
      this.cancelHoverTimer();
    }, true);
  }

  startHoverTimer(element) {
    this.cancelHoverTimer();
    
    this.hoverTimer = setTimeout(() => {
      this.showTooltip(element);
    }, this.HOVER_DELAY);
  }

  cancelHoverTimer() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  showTooltip(element) {
    const text = element.getAttribute('data-tooltip');
    if (!text) return;

    // Remove existing tooltip
    this.hideTooltip();

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;

    // Position tooltip after DOM has rendered it
    requestAnimationFrame(() => {
      this.positionTooltip(tooltip, element);
      tooltip.classList.add('show');
    });
  }

  positionTooltip(tooltip, target) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Account for body zoom
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    
    // Calculate available space in each direction
    const spaceAbove = targetRect.top;
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceLeft = targetRect.left;
    const spaceRight = window.innerWidth - targetRect.right;

    let position = 'top'; // default
    let top, left;

    // Determine best position based on available space
    if (spaceAbove > tooltipRect.height + 10) {
      // Place above
      position = 'top';
      top = (targetRect.top - tooltipRect.height - 10) / zoom;
      left = (targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2)) / zoom;
    } else if (spaceBelow > tooltipRect.height + 10) {
      // Place below
      position = 'bottom';
      top = (targetRect.bottom + 10) / zoom;
      left = (targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2)) / zoom;
    } else if (spaceRight > tooltipRect.width + 10) {
      // Place to the right
      position = 'right';
      top = (targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2)) / zoom;
      left = (targetRect.right + 10) / zoom;
    } else if (spaceLeft > tooltipRect.width + 10) {
      // Place to the left
      position = 'left';
      top = (targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2)) / zoom;
      left = (targetRect.left - tooltipRect.width - 10) / zoom;
    } else {
      // Default to below if no good space
      position = 'bottom';
      top = (targetRect.bottom + 10) / zoom;
      left = (targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2)) / zoom;
    }

    // Keep tooltip within viewport bounds
    const padding = 10 / zoom;
    if (left < padding) {
      left = padding;
    } else if (left + tooltipRect.width / zoom > window.innerWidth / zoom - padding) {
      left = window.innerWidth / zoom - tooltipRect.width / zoom - padding;
    }

    if (top < padding) {
      top = padding;
    } else if (top + tooltipRect.height / zoom > window.innerHeight / zoom - padding) {
      top = window.innerHeight / zoom - tooltipRect.height / zoom - padding;
    }

    // Apply position
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.classList.add(position);
  }

  hideTooltip() {
    if (this.currentTooltip) {
      this.currentTooltip.remove();
      this.currentTooltip = null;
    }
  }
}

// Initialize tooltip system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TooltipManager();
});
