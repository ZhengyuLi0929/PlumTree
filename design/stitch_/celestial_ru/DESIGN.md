# Design System Specification: The Ethereal Archive

## 1. Overview & Creative North Star
**Creative North Star: The Digital Scholar’s Pavilion**

This design system is a meditation on the Song Dynasty aesthetic—an era defined by refined simplicity, the pursuit of "inner essence" over outward flash, and the masterful use of negative space (*liubai*). We are not building a standard utility; we are constructing a digital gallery that breathes. 

The system breaks the modern "template" look by rejecting heavy borders and rigid grids. Instead, it relies on **Intentional Asymmetry** and **Tonal Depth**. Elements should feel as though they are floating on a wash of misty air, balanced not by lines, but by the weight of typography and the "qi" of empty space. Every interaction must feel sacred, quiet, and deliberate.

---

## 2. Colors & Atmospheric Tones

The palette is rooted in the celadon glazes of Ru Kiln and the gradients of ink-wash paintings. 

| Role | Token | HEX | Application |
| :--- | :--- | :--- | :--- |
| **Ru Kiln Azure** | `primary` | `#39656f` | Signature accents, primary actions, calligraphic focus. |
| **Moonlight White** | `surface-container-lowest` | `#ffffff` | High-lighted surfaces, elevated "paper" layers. |
| **Ink Black** | `on-surface` | `#191c1d` | High-contrast editorial typography. |
| **Misty Gray** | `surface-container` | `#eceeef` | Background washes and secondary grounding. |

### The "No-Line" Rule
Traditional UI relies on 1px borders to separate content. **This system prohibits 1px solid borders for sectioning.** 
*   **Boundaries through Tone:** Use `surface-container-low` (#f2f4f5) against a `surface` (#f8fafb) background to define areas.
*   **The Ink Wash Gradient:** Use subtle linear gradients (e.g., `surface` to `surface-container`) to suggest the start of a new section, mimicking the way ink bleeds into silk.

### Glass & Surface Hierarchy
Treat the interface as stacked sheets of fine Xuan paper.
*   **Nesting:** Place a `surface-container-lowest` card inside a `surface-container` area to create "lift" without shadows.
*   **Glassmorphism:** For floating navigation or modals, use `surface-variant` with a 60% opacity and a `backdrop-blur` of 20px. This allows the "Azure" tones of the background to bleed through, maintaining a sense of atmospheric depth.

---

### 3. Typography: The Editorial Voice

Hierarchy is achieved through the stark contrast between the scholarly Serif and the functional Sans-Serif.

*   **Display & Headlines (Newsreader):** These are your "Calligraphy." Use `display-lg` for hero moments with wide tracking (-0.02em) to evoke the elegance of Songti woodblock printing. 
*   **Body & Labels (Manrope):** These are your "Annotations." Manrope provides a clean, modern counter-balance. It should be used sparingly to keep the interface from feeling cluttered.

**The Typographic Rhythm:**
Always pair a `display-md` headline with a generous `16` (5.5rem) top margin. The goal is to make the user stop and read, rather than scan and scroll.

---

### 4. Elevation & Depth: Tonal Layering

We reject the "Material" drop-shadow. Depth must feel ambient and natural.

*   **The Layering Principle:** Stacking tokens is our primary tool for depth. 
    *   *Base:* `surface`
    *   *Sub-section:* `surface-container-low`
    *   *Action Card:* `surface-container-lowest`
*   **Ambient Shadows:** If an element must float (e.g., a high-end picker), use a shadow color tinted with `#39656f` at 4% opacity with a 40px blur. It should look like a soft glow, not a shadow.
*   **The Ghost Border:** If accessibility requires a stroke, use `outline-variant` at 15% opacity. It should be barely perceptible—a "whisper" of a line.

---

### 5. Components: The Gallery Artifacts

#### Buttons (The Seal)
Buttons should feel like a scholar's seal—precious and weighted.
*   **Primary:** Background `primary`, text `on-primary`. 0px border-radius. Padding: `2.5` (top/bottom) by `6` (left/right).
*   **Tertiary:** No background. Underline using a `px` height `primary` container that expands on hover.
*   **States:** On hover, primary buttons should shift to `primary-fixed-dim`, creating a subtle "ink-dry" effect.

#### Cards & Lists (The Scroll)
*   **No Dividers:** Vertical white space from the `8` (2.75rem) or `10` (3.5rem) scale is your divider.
*   **Interaction:** On hover, a card should not "pop" up; it should subtly transition its background from `surface` to `surface-container-lowest`.

#### Input Fields (The Inkstone)
*   **Style:** A single, ultra-thin `outline-variant` bottom border (the Ghost Border). 
*   **Focus:** The bottom border transitions to `primary` (Ru Kiln Azure) with a subtle `primary-container` glow underneath.

#### Additional Component: The "Zen Loader"
Instead of a spinning wheel, use a slow-pulsing gradient wash that moves from `surface` to `primary-container` and back, resembling ink dispersing in water.

---

### 6. Do’s and Don’ts

**Do:**
*   **Do** embrace extreme asymmetry. Large headlines can be offset to the left with body text pushed far to the right.
*   **Do** use the `20` (7rem) spacing token between major content blocks. If it feels like "too much" white space, it’s probably just right.
*   **Do** treat images like museum artifacts—give them wide `surface-container` mats (padding) and never use rounded corners.

**Don't:**
*   **Don't** use 100% black. Always use `Ink Black` (`on-surface`) for a softer, more organic feel.
*   **Don't** use "Rounded" or "Pill" shapes. Everything in this system is sharp, architectural, and deliberate (0px radius).
*   **Don't** clutter the screen with icons. Use text labels in `label-sm` (Manrope) for a more sophisticated, editorial look.
*   **Don't** use "Pop" colors. If you need to signal an error, use the `error` (#ba1a1a) token sparingly, muted by a `surface-container-low` backdrop.