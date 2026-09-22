# roc_desk-editor migration

The editor components, editor store, file adapters, and standalone file-drop
logic are now tracked here as the canonical migration source. The host keeps a
compatibility copy while the filesystem/symbol interfaces are extracted into
the common core and the standalone Tauri/web shell is added.

The workspace tool will eventually consume the editor package as a one-way
dependency; editor must not depend on workspace.
