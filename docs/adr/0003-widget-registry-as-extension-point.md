# Widget Registry as the sole extension point

A single TypeScript module (`src/components/widgets/registry.ts`) maps widget names to lazy-loaded React components. Adding a new widget requires: (1) create the component, (2) add one import line to the registry. The article page's content splitter and the editor's dropdown both read from this registry. No database, no config file, no plugin system.

## Considered Options

- **Database-stored widget config** (rejected): overkill — widgets are bespoke code, not user-managed content. Data is hardcoded per widget.
- **File-system convention (auto-discovery)** (rejected): implicit registration makes it harder to trace which widgets exist. Explicit registry is clearer and safer.
- **JSON config file** (rejected): indirection without benefit — you still need to write the component, so the registry entry might as well be in TS.

## Consequences

- The registry is the single source of truth for available widgets.
- The editor dropdown reads widget names from the registry keys.
- Unknown widget names (typos) render a visible "Unknown widget" placeholder, not silently ignored.
