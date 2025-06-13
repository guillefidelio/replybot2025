Brand Identity
Primary Brand: AiReplyBot - AI-powered smart reply generation for enhanced communication
CSS Configuration
Main Stylesheet Setup
css@import "tailwindcss";

@theme {
  /* Brand Colors */
  --color-ai-purple: oklch(0.67 0.2 285);
  --color-ai-blue: oklch(0.6 0.2 240);
  --color-ai-purple-50: oklch(0.97 0.05 285);
  --color-ai-purple-100: oklch(0.94 0.1 285);
  --color-ai-purple-600: oklch(0.6 0.25 285);
  --color-ai-purple-700: oklch(0.55 0.25 285);
  --color-ai-blue-50: oklch(0.97 0.05 240);
  --color-ai-blue-100: oklch(0.94 0.1 240);
  --color-ai-blue-600: oklch(0.55 0.25 240);
  --color-ai-blue-700: oklch(0.5 0.25 240);

  /* Typography */
  --font-display: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

  /* Spacing (0.25rem base) */
  --spacing: 0.25rem;

  /* Border Radius */
  --radius-xs: 0.25rem;
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* Shadows */
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* Animation Easing */
  --ease-smooth: cubic-bezier(0.4, 0.0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

  /* Container Queries for Extension */
  --container-xs: 20rem;
  --container-sm: 24rem;
  --container-md: 28rem;
}

/* Dark mode variant */
@variant dark (&:where(.dark, .dark *));

/* Chrome Extension specific variants */
@variant extension-popup (&:where([data-extension="popup"]));
@variant extension-sidebar (&:where([data-extension="sidebar"]));
Color System
Primary Brand Colors

AI Purple: bg-ai-purple text-ai-purple - Primary brand color
AI Blue: bg-ai-blue text-ai-blue - Secondary brand color
Gradient: bg-linear-to-r from-ai-purple to-ai-blue

Semantic Colors (Using v4 Color Scale)

Background Primary: bg-white dark:bg-slate-900
Background Secondary: bg-slate-50 dark:bg-slate-800
Background Tertiary: bg-slate-100 dark:bg-slate-700

Text Colors

Primary: text-slate-900 dark:text-slate-100
Secondary: text-slate-600 dark:text-slate-400
Muted: text-slate-500 dark:text-slate-500
Inverse: text-white dark:text-slate-900

Status Colors

Success: text-emerald-600 dark:text-emerald-400
Warning: text-amber-600 dark:text-amber-400
Error: text-red-600 dark:text-red-400
Info: text-blue-600 dark:text-blue-400

Typography Scale
Font Sizes (Using v4 Dynamic Scaling)

Display: text-4xl font-bold leading-tight (36px)
Heading Large: text-2xl font-semibold leading-tight (24px)
Heading Medium: text-xl font-semibold leading-snug (20px)
Heading Small: text-lg font-medium leading-snug (18px)
Body Large: text-base font-normal leading-relaxed (16px)
Body: text-sm font-normal leading-relaxed (14px)
Caption: text-xs font-normal leading-normal (12px)
Button: text-sm font-medium leading-none (14px)

Spacing System (v4 Dynamic Spacing)
Standard Spacing (Multiples of 0.25rem)

Micro: p-1 m-1 (4px)
Small: p-2 m-2 (8px)
Medium: p-4 m-4 (16px)
Large: p-6 m-6 (24px)
Extra Large: p-8 m-8 (32px)
Huge: p-12 m-12 (48px)

Component Spacing

Card Padding: p-6 (24px)
Compact Card: p-4 (16px)
Button Padding: px-6 py-3 (24px x 12px)
Small Button: px-4 py-2 (16px x 8px)
Input Padding: px-4 py-3 (16px x 12px)
Section Gaps: space-y-6 (24px)
List Spacing: space-y-4 (16px)

Layout System
Container Sizes (Chrome Extension Optimized)

Extension Popup: w-80 (320px)
Extension Sidebar: w-96 (384px)
Modal Content: w-[28rem] (448px)
Card Max Width: max-w-sm (384px)

Grid System

Main Grid: grid grid-cols-12 gap-4
Card Grid: grid grid-cols-1 sm:grid-cols-2 gap-6
Auto Grid: grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6

Component Styles
Buttons
Primary Button
css/* Using v4 syntax with CSS variables */
@utility btn-primary {
  @apply bg-ai-purple hover:bg-ai-purple-600 
         text-white font-medium py-3 px-6 
         rounded-sm shadow-sm 
         transition-all duration-200 
         focus:ring-2 focus:ring-ai-purple/50 focus:ring-offset-2;
}
Secondary Button
css@utility btn-secondary {
  @apply bg-white hover:bg-slate-50 
         text-slate-700 font-medium py-3 px-6 
         rounded-sm border border-slate-300 shadow-xs
         transition-all duration-200
         focus:ring-2 focus:ring-ai-purple/50 focus:ring-offset-2;
}
Ghost Button
css@utility btn-ghost {
  @apply text-ai-purple hover:bg-ai-purple-50 
         font-medium py-3 px-6 rounded-sm
         transition-all duration-200
         focus:ring-2 focus:ring-ai-purple/50 focus:ring-offset-2;
}
Cards
css@utility card {
  @apply bg-white dark:bg-slate-800 
         rounded-lg shadow-sm border border-slate-200 dark:border-slate-700
         transition-all duration-200;
}

@utility card-hover {
  @apply hover:shadow-md hover:scale-[1.02] transform;
}
Input Fields
css@utility input-field {
  @apply w-full px-4 py-3 
         bg-white dark:bg-slate-800
         border border-slate-300 dark:border-slate-600
         rounded-sm
         text-slate-900 dark:text-slate-100
         placeholder:text-slate-500
         focus:ring-2 focus:ring-ai-purple/50 focus:border-ai-purple
         transition-all duration-200;
}
Navigation
Tab Navigation
css@utility tab-active {
  @apply border-b-2 border-ai-purple text-ai-purple-700 font-medium;
}

@utility tab-inactive {
  @apply text-slate-500 hover:text-slate-700 font-medium
         border-b-2 border-transparent
         transition-colors duration-200;
}
Container Queries (v4 Feature)
Extension Context Queries
css/* Use @ prefix for container queries */
@container (min-width: 320px) {
  .extension-popup {
    @apply p-6;
  }
}

@container (min-width: 384px) {
  .extension-sidebar {
    @apply grid grid-cols-2 gap-4;
  }
}
3D Transform Utilities (v4 Feature)
AI Bot Animation Effects
css@utility ai-float {
  @apply transform-3d animate-pulse
         hover:translate-z-2 hover:rotate-y-3
         transition-all duration-300;
}

@utility ai-card-lift {
  @apply transform-3d
         hover:translate-z-4 hover:rotate-x-1
         transition-all duration-200;
}
Enhanced Gradients (v4 Feature)
Brand Gradients
css@utility gradient-ai-primary {
  @apply bg-linear-135/oklch from-ai-purple to-ai-blue;
}

@utility gradient-ai-soft {
  @apply bg-radial-[at_top_left] from-ai-purple-50 to-ai-blue-50;
}

@utility gradient-ai-conic {
  @apply bg-conic from-ai-purple via-ai-blue to-ai-purple;
}
New Shadow System (v4 Feature)
Enhanced Shadows with Inset
css@utility shadow-ai-glow {
  @apply shadow-lg shadow-ai-purple/20
         inset-shadow-xs inset-shadow-white/50;
}

@utility shadow-ai-deep {
  @apply shadow-xl shadow-slate-900/10
         inset-shadow-sm inset-shadow-ai-purple/10;
}
Variants and States
Custom Variants
css/* AI-specific states */
@variant ai-thinking (&[data-state="thinking"]);
@variant ai-ready (&[data-state="ready"]);
@variant ai-error (&[data-state="error"]);

/* Extension context */
@variant extension-active (&[data-extension-active="true"]);
@variant reply-mode (&[data-mode="reply"]);
Composite Variants (v4 Feature)

Loading State: ai-thinking:opacity-50 ai-thinking:animate-pulse
Error State: ai-error:ring-2 ai-error:ring-red-500/50
Success State: ai-ready:ring-2 ai-ready:ring-emerald-500/50

Chrome Extension Specific Styles
Popup Container
css@utility extension-popup {
  @apply w-80 min-h-96 max-h-[600px]
         bg-white dark:bg-slate-900
         overflow-y-auto
         extension-popup:p-0;
}
Loading States
css@utility loading-skeleton {
  @apply bg-slate-200 dark:bg-slate-700
         animate-pulse rounded-sm;
}

@utility loading-spinner {
  @apply animate-spin text-ai-purple;
}
Accessibility Features
Focus Management
css@utility focus-ai {
  @apply focus:outline-hidden 
         focus:ring-2 focus:ring-ai-purple/50 focus:ring-offset-2
         focus:ring-offset-white dark:focus:ring-offset-slate-900;
}
High Contrast Mode
css@variant high-contrast (@media (prefers-contrast: high));

/* Usage: high-contrast:border-2 high-contrast:border-black */
Dark Mode Implementation
Complete Dark Theme
css@utility dark-theme {
  @apply dark:bg-slate-900 dark:text-slate-100
         dark:border-slate-700
         scheme-dark;
}
Animation System
AI-Themed Animations
css@utility animate-ai-pulse {
  animation: ai-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes ai-pulse {
  0%, 100% { 
    opacity: 1; 
    transform: scale(1);
  }
  50% { 
    opacity: 0.8; 
    transform: scale(1.05);
  }
}