# SignalGuard Mission Control Design System

## Brand & Style
The design system is engineered for high-stakes SRE and DevOps environments where cognitive load management is paramount. The personality is **Precise, Technical, and Authoritative**, designed to feel like a modern mission-control interface.

The visual style follows a **Modern Corporate/Technical** aesthetic with a heavy emphasis on data density and information hierarchy. It utilizes a deep dark-mode palette to reduce eye strain during long on-call shifts, employing subtle 1px borders and distinct tonal layers rather than heavy shadows to define structure. The UI is intentionally "quiet" until an incident occurs, at which point high-saturation status colors draw immediate attention to critical failures.

## Colors
The palette is optimized for a **Dark Mode Only** experience. 

- **Foundations:** Use `#0B0E14` for the primary application background and `#151922` for all card-based containers or sidebars. 
- **Borders:** Apply `#242938` for all structural dividers and element outlines.
- **Accents:** The Primary Electric Blue is reserved for interactive states and primary actions.
- **Semantic Logic:** 
    - **Critical (#EF4444):** Used for "Firing" alerts and high-error rates.
    - **Warning (#F59E0B):** Used for "Pending" or threshold breaches.
    - **Success (#10B981):** Used for "Resolved" states or healthy heartbeat signals.
    - **Info (#8B5CF6):** Used for "Suppressed" alerts or configuration-related metadata.

## Typography
This design system employs a dual-font strategy to separate UI navigation from raw data analysis.

- **Inter (Sans-serif):** Used for all navigational elements, page titles, and descriptive text. It provides a modern, readable foundation for the interface.
- **JetBrains Mono (Monospace):** Used for all technical strings including Trace IDs, Fingerprints, Timestamps, IP addresses, and Metric values. The increased legibility of individual characters helps prevent errors when reading complex logs.

**Scale and Density:**
Line heights are kept tight (approx 1.2x - 1.4x) to maximize the amount of information visible on screen without requiring excessive scrolling.

## Layout & Spacing
The layout follows a **Fluid Grid** model with high-density spacing.

- **Grid:** Use a 12-column layout for dashboard views. On desktop, use 24px outer margins and 16px gutters between metric cards.
- **Rhythm:** A 4px baseline grid ensures alignment across technical data. 
- **Data Rows:** For log streams and tables, use a 4px vertical gap between rows to maintain a high information density while preserving horizontal scanability.
- **Mobile Adaption:** At the 768px breakpoint, the 12-column grid collapses into a single-column stack, and container padding reduces to 16px.

## Elevation & Depth
Depth is communicated through **Tonal Layering** rather than traditional shadows, ensuring the UI remains crisp on high-resolution monitors.

- **Level 0 (Base):** `#0B0E14` - The canvas.
- **Level 1 (Surface):** `#151922` - Used for metric cards, sidebars, and main content areas.
- **Level 2 (Overlay):** `#1C212C` - Used for modals, dropdown menus, and tooltips. Use a subtle 1px border (`#242938`) to provide definition.
- **Interaction:** On hover, interactive surfaces should lighten by 2-3% or gain a primary-colored 1px stroke.

## Shapes
This design system utilizes a tiered corner radius system to differentiate between structural containers and data points:

- **Large Containers (Cards, Dashboards):** 8px - 12px (`rounded-lg`) for a modern, professional feel.
- **Small Elements (Input fields, Buttons):** 6px.
- **Data Elements (Table Rows, Progress Bar segments):** 2px to maintain a rigid, technical appearance.
- **Status Pills:** Fully rounded (pill-shaped) to distinguish them from interactive buttons.

## Components

### Status Badges (Pills)
Badges use a "Low-Opacity Fill + High-Contrast Text" pattern.
- **Firing:** Red background (15% opacity), Solid Red text, 2px rounded corners.
- **Resolved:** Emerald background (15% opacity), Solid Emerald text.
- **Suppressed:** Muted Purple background (15% opacity), Solid Purple text.

### Data Tables
- **Height:** Row height fixed at 32px for high-density "Compact" mode.
- **Border:** Bottom-only border of 1px `#242938`.
- **Typography:** Use `code-sm` for technical data values and `body-sm` for headers.

### Metric Cards
- **Header:** Title in `body-sm` (bold) with an "Info" icon for tooltip descriptions.
- **Value:** Large `code-md` or `headline-md` value centered or left-aligned.
- **Sparklines:** 2px stroke width primary or semantic color (Red if the metric is in an alert state), no fill below the line to keep the UI clean.

### Input Fields
- **Background:** `#0B0E14` (Inset look).
- **Border:** 1px `#242938`.
- **Focus State:** 1px `#3B82F6` with a subtle outer glow of the same color (4px blur).
