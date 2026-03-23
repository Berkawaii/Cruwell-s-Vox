# Design System Strategy: The Sonic Ether

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Sonic Ether."** 

We are moving away from the "chat-app-in-a-box" utility look. Instead, we are building a high-fidelity, atmospheric environment where voice and data feel like light passing through deep water. The aesthetic breaks the traditional grid through **intentional depth layering** and **asymmetric focal points**. By utilizing glassmorphism and high-contrast typography, we create a sense of vast, digital space that feels premium, futuristic, and quiet—until the "Vox" (voice) activates the interface with vibrant light.

## 2. Colors & Atmospheric Depth
This system uses a palette of "Deep Space" neutrals and "Electric Kinetic" accents. Colors are not just fills; they are light sources.

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for layout sectioning. In this system, boundaries are defined by **Background Color Shifts**. For example, a `surface-container-low` sidebar sits against a `background` main stage. If you need to separate elements, use a `24` (6rem) vertical spacing gap or a tonal shift.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of semi-transparent panels. 
*   **Base:** `background` (#0c0e12)
*   **Level 1:** `surface-container-low` (#111318) for main navigation or sidebars.
*   **Level 2:** `surface-container` (#171a1f) for the primary content area.
*   **Level 3:** `surface-container-highest` (#23262c) for active panels or pop-overs.

### The "Glass & Gradient" Rule
Floating panels (Modals, Hover Cards) must use **Glassmorphism**. Apply `surface-variant` with a 60% opacity and a `backdrop-blur` of 20px. 
*   **Signature Textures:** For primary CTAs, do not use a flat hex code. Use a linear gradient: `primary` (#88adff) to `primary_dim` (#0f6ef0) at a 135-degree angle. This gives buttons a "lit from within" quality.

## 3. Typography: Editorial Authority
We pair the technical precision of **Inter** with the aggressive, futuristic wide-stance of **Space Grotesk**.

*   **Display & Headlines (Space Grotesk):** Use `display-lg` to `headline-sm` for high-impact areas. These should be tracked slightly tighter (-2%) to feel like a high-end tech journal.
*   **Body & Titles (Inter):** The workhorse. `title-lg` is for user names; `body-md` is for message content. Use `on_surface_variant` (#aaabb0) for timestamps to create a soft visual hierarchy.
*   **Labels (Manrope):** Use `label-sm` in all-caps with +5% letter spacing for technical metadata (e.g., bitrates, server regions).

## 4. Elevation & Depth
Hierarchy is achieved through **Tonal Layering**, not shadows or lines.

*   **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` section. The subtle darkening creates a "recessed" look that feels more modern than a traditional drop shadow.
*   **Ambient Shadows:** When a component must "float" (e.g., a context menu), use a shadow with a blur of `32px` at 8% opacity. The shadow color must be a tint of `secondary` (#b884ff) rather than black, creating a "neon glow" rather than a "dark shadow."
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use the `outline_variant` token at **15% opacity**. This creates a "hairline" shimmer that suggests a boundary without hard-coding a line.

## 5. Components

### Kinetic Buttons
*   **Primary:** Gradient of `primary` to `primary_dim`. Roundedness: `lg` (1rem).
*   **Secondary:** Ghost style. Transparent fill with a `Ghost Border` and `primary` text.
*   **States:** On `:hover`, add a `0 0 15px` outer glow using the `surface_tint` color.

### The "Vox" Indicator (Active Speaker)
Instead of a simple green dot, use a `secondary` (#b884ff) 2px outer glow (aura) around the user's avatar. Apply a subtle pulse animation that syncs with voice input levels.

### Communication Cards
*   **Forbid Divider Lines:** Use `8` (2rem) of vertical spacing to separate messages. 
*   **Nesting:** Grouped messages should sit on a `surface_container_high` background with `md` (0.75rem) rounded corners.

### Glass Inputs
*   **Styling:** Fill with `surface_container_lowest` at 40% opacity. 
*   **Active State:** The bottom border transforms into a 2px `tertiary` (#a1faff) line that glows, suggesting the input is "powered on."

### Contextual Tooltips
*   **Style:** `surface_bright` background with `label-sm` typography. 
*   **Animation:** Scale in from 95% to 100% with a `0.2s` ease-out to mimic a lens focusing.

## 6. Do’s and Don’ts

### Do:
*   **Use Asymmetry:** Align high-level stats to the right while main conversations are centered.
*   **Embrace Negative Space:** Use the `16` (4rem) spacing token generously between major functional groups.
*   **Color as Data:** Use `secondary` (purple) exclusively for "Vox" (voice) actions and `primary` (blue) for "Text/System" actions.

### Don’t:
*   **No 100% Opaque Borders:** Never use a solid white or grey line to divide content.
*   **No Pure Black:** Use `background` (#0c0e12) instead of #000000 to maintain the "inky midnight" depth.
*   **Avoid Flatness:** If a panel looks flat, increase its `backdrop-blur` or shift its surface-container tier.