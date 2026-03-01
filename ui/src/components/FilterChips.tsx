import React from "react";

export interface ChipOption {
  label: string;
  value: string;
}

export interface FilterChipsProps {
  options: ChipOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** When true, multiple chips can be active at once. Default: false. */
  multiSelect?: boolean;
  /** If provided, this value acts as the "All / clear" sentinel. Selecting it
   *  deselects all others; if all others are deselected it becomes active. */
  allValue?: string;
}

/**
 * Horizontal row of toggleable pill chips.
 * Active chip: filled purple. Inactive: ghost with subtle hover.
 */
export default function FilterChips({
  options,
  selected,
  onChange,
  multiSelect = false,
  allValue,
}: FilterChipsProps) {
  function toggle(value: string) {
    if (!multiSelect) {
      // single-select: clicking the already-active chip re-selects "all"
      if (selected.includes(value)) {
        onChange(allValue ? [allValue] : []);
      } else {
        onChange([value]);
      }
      return;
    }

    // multi-select
    if (allValue && value === allValue) {
      onChange([allValue]);
      return;
    }

    let next: string[];
    if (selected.includes(value)) {
      next = selected.filter((v) => v !== value);
    } else {
      next = selected.filter((v) => v !== allValue).concat(value);
    }

    if (next.length === 0) {
      onChange(allValue ? [allValue] : []);
    } else {
      onChange(next);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter options">
      {options.map((opt) => {
        const isActive = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={isActive}
            className={`
              px-3 py-1 rounded-full text-sm font-medium transition-all duration-150 animate-scale-in
              ${
                isActive
                  ? "bg-hilo-purple text-white"
                  : "bg-transparent border border-hilo-gray/30 text-hilo-dark/60 dark:text-white/60 hover:border-hilo-purple/50 dark:hover:border-hilo-purple-light/50 hover:text-hilo-purple dark:hover:text-hilo-purple-light"
              }
            `}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
