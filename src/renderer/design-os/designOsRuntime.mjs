
import { createDesignOsFormConfigurationController } from './designOsFormConfiguration.mjs';

export const DESIGN_OS_RESOLVER_ORDER = Object.freeze([
  'base',
  'mode',
  'profile',
  'workspace',
  'platform',
  'accessibility_override',
  'runtime_fallback',
  'design_state',
]);

export const DESIGN_OS_COMMIT_POINT_IDS = Object.freeze([
  'apply',
  'drag_end',
  'resize_end',
  'workspace_save',
  'mode_switch',
  'safe_reset',
  'restore_last_stable',
  'app_close_debounced',
]);

export const DESIGN_OS_FORBIDDEN_PATCH_ROOTS = Object.freeze([
  'product_truth',
  'command_truth',
  'recovery_truth',
  'command_availability',
]);

export const DESIGN_OS_REQUIRED_TOKEN_PATHS = Object.freeze([
  'schemaVersion',
  'baselineId',
  'color.background.canvas',
  'color.text.primary',
  'color.text.secondary',
  'color.surface.panel',
  'typography.font.body.family',
  'typography.font.body.sizePx',
  'typography.font.ui.family',
  'typography.scale.body.lineHeight',
  'spacing.base',
  'radius.sm',
  'focus.ring.color',
  'motion.enabled',
  'density.default.scale',
  'surface.editor.background',
]);

export const DESIGN_OS_LAYOUT_PATCH_KEYS = Object.freeze([
  'left_width',
  'right_width',
  'bottom_height',
  'editor_root',
  'viewport_width',
  'viewport_height',
  'shell_mode',
  'right_collapsed',
  'right_expanded_width',
]);

export const DESIGN_OS_DANGEROUS_OBJECT_KEYS = Object.freeze([
  '__proto__',
  'prototype',
  'constructor',
]);

const DEFAULT_LAYOUT_SNAPSHOT = Object.freeze({
  left_width: 290,
  right_width: 290,
  bottom_height: 96,
  editor_root: 'docked',
  viewport_width: 1440,
  viewport_height: 900,
  shell_mode: 'CALM_DOCKED',
  right_collapsed: false,
  right_expanded_width: 290,
});

const DEFAULT_RUNTIME_CONTEXT = Object.freeze({
  shell_mode: 'CALM_DOCKED',
  profile: 'BASELINE',
  workspace: 'WRITE',
  platform: 'macos',
  accessibility: 'default',
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTextString(value) {
  return typeof value === 'string'
    ? value.replace(/\r\n?/gu, '\n').normalize('NFC')
    : '';
}

function stableCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertSafeObjectKey(key, path) {
  if (DESIGN_OS_DANGEROUS_OBJECT_KEYS.includes(key)) {
    throw new Error(`Unsafe object key in patch tree: ${path || key}`);
  }
}

function assertSafeObjectTree(value, path = '') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSafeObjectTree(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    assertSafeObjectKey(key, nextPath);
    assertSafeObjectTree(value[key], nextPath);
  }
}

export function deepCopyTree(value) {
  if (Array.isArray(value)) return value.map((entry) => deepCopyTree(entry));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value)) {
    assertSafeObjectKey(key, key);
    out[key] = deepCopyTree(value[key]);
  }
  return out;
}

export function deepMerge(base, patch) {
  const out = deepCopyTree(base);
  if (!isPlainObject(patch)) return out;
  assertSafeObjectTree(patch);
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
      continue;
    }
    out[key] = deepCopyTree(value);
  }
  return out;
}

export function deepFillMissing(target, fallback) {
  const out = deepCopyTree(target);
  if (!isPlainObject(fallback)) return out;
  assertSafeObjectTree(fallback);
  for (const key of Object.keys(fallback)) {
    const value = fallback[key];
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = deepCopyTree(value);
      continue;
    }
    if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = deepFillMissing(out[key], value);
    }
  }
  return out;
}

export function createLayoutSnapshot(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    left_width: Number.isFinite(source.left_width) ? Math.trunc(source.left_width) : DEFAULT_LAYOUT_SNAPSHOT.left_width,
    right_width: Number.isFinite(source.right_width) ? Math.trunc(source.right_width) : DEFAULT_LAYOUT_SNAPSHOT.right_width,
    bottom_height: Number.isFinite(source.bottom_height) ? Math.trunc(source.bottom_height) : DEFAULT_LAYOUT_SNAPSHOT.bottom_height,
    editor_root: normalizeString(source.editor_root) || DEFAULT_LAYOUT_SNAPSHOT.editor_root,
    viewport_width: Number.isFinite(source.viewport_width) ? Math.trunc(source.viewport_width) : DEFAULT_LAYOUT_SNAPSHOT.viewport_width,
    viewport_height: Number.isFinite(source.viewport_height) ? Math.trunc(source.viewport_height) : DEFAULT_LAYOUT_SNAPSHOT.viewport_height,
    shell_mode: normalizeString(source.shell_mode) || DEFAULT_LAYOUT_SNAPSHOT.shell_mode,
    right_collapsed: source.right_collapsed === true,
    right_expanded_width: Number.isFinite(source.right_expanded_width) ? Math.trunc(source.right_expanded_width) : DEFAULT_LAYOUT_SNAPSHOT.right_expanded_width,
  };
}

export function cloneLayoutSnapshot(snapshot = {}) {
  return createLayoutSnapshot(snapshot);
}

export function createRuntimeContext(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    shell_mode: normalizeString(source.shell_mode) || DEFAULT_RUNTIME_CONTEXT.shell_mode,
    profile: normalizeString(source.profile) || DEFAULT_RUNTIME_CONTEXT.profile,
    workspace: normalizeString(source.workspace) || DEFAULT_RUNTIME_CONTEXT.workspace,
    platform: normalizeString(source.platform) || DEFAULT_RUNTIME_CONTEXT.platform,
    accessibility: normalizeString(source.accessibility) || DEFAULT_RUNTIME_CONTEXT.accessibility,
  };
}

function sameRuntimeContext(left, right) {
  return left.shell_mode === right.shell_mode
    && left.profile === right.profile
    && left.workspace === right.workspace
    && left.platform === right.platform
    && left.accessibility === right.accessibility;
}

function normalizeForHash(value) {
  if (typeof value === 'string') return normalizeTextString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map((entry) => normalizeForHash(entry));
  if (!isPlainObject(value)) return String(value);
  const out = {};
  for (const key of Object.keys(value).sort((left, right) => stableCompare(normalizeTextString(left), normalizeTextString(right)))) {
    out[normalizeTextString(key)] = normalizeForHash(value[key]);
  }
  return out;
}

export function buildProductTruthHash(productTruth = {}) {
  const normalized = normalizeForHash({
    project_id: normalizeTextString(productTruth.project_id),
    active_scene_id: normalizeTextString(productTruth.active_scene_id),
    scenes: isPlainObject(productTruth.scenes) ? productTruth.scenes : {},
  });
  const input = JSON.stringify(normalized);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function lookupPath(tree, path) {
  const parts = String(path).split('.');
  let current = tree;
  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) {
      throw new Error(`Missing token path: ${path}`);
    }
    current = current[part];
  }
  return current;
}

function validateRequiredTokens(tokens) {
  const missing = [];
  for (const path of DESIGN_OS_REQUIRED_TOKEN_PATHS) {
    try {
      lookupPath(tokens, path);
    } catch {
      missing.push(path);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required tokens: ${missing.join(', ')}`);
  }
}

function validatePatch(patch, options = {}) {
  if (!isPlainObject(patch)) return;
  assertSafeObjectTree(patch);
  const overlap = DESIGN_OS_FORBIDDEN_PATCH_ROOTS.filter((root) => Object.prototype.hasOwnProperty.call(patch, root));
  if (overlap.length > 0) {
    throw new Error(`Forbidden patch roots: ${overlap.join(', ')}`);
  }
  const allowedRoots = Array.isArray(options.allowedRoots) ? options.allowedRoots : [];
  if (allowedRoots.length > 0) {
    const unknownRoots = Object.keys(patch)
      .filter((key) => !allowedRoots.includes(key))
      .sort((left, right) => stableCompare(left, right));
    if (unknownRoots.length > 0) {
      throw new Error(`Unknown design patch roots: ${unknownRoots.join(', ')}`);
    }
  }
}

function validateLayoutPatch(patch) {
  if (!isPlainObject(patch)) return;
  assertSafeObjectTree(patch);
  const unknownKeys = Object.keys(patch)
    .filter((key) => !DESIGN_OS_LAYOUT_PATCH_KEYS.includes(key))
    .sort((left, right) => stableCompare(left, right));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown layout patch keys: ${unknownKeys.join(', ')}`);
  }
}

function normalizeCommandKernel(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const catalog = isPlainObject(source.catalog) ? deepCopyTree(source.catalog) : {};
  const capabilities = isPlainObject(source.capabilities) ? deepCopyTree(source.capabilities) : {};
  const externalIsAvailable = typeof source.isAvailable === 'function' ? source.isAvailable.bind(source) : null;
  return {
    catalog,
    capabilities,
    isAvailable(commandId, ctx = {}) {
      if (externalIsAvailable) return externalIsAvailable(commandId, ctx);
      return Boolean(capabilities[commandId]);
    },
    listKnownCommands() {
      return Object.keys(catalog);
    },
  };
}

function normalizeRuntimeState(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    base_tokens: isPlainObject(source.base_tokens) ? deepCopyTree(source.base_tokens) : {},
    mode_overrides: isPlainObject(source.mode_overrides) ? deepCopyTree(source.mode_overrides) : {},
    profile_overrides: isPlainObject(source.profile_overrides) ? deepCopyTree(source.profile_overrides) : {},
    workspace_overrides: isPlainObject(source.workspace_overrides) ? deepCopyTree(source.workspace_overrides) : {},
    platform_overrides: isPlainObject(source.platform_overrides) ? deepCopyTree(source.platform_overrides) : {},
    accessibility_overrides: isPlainObject(source.accessibility_overrides) ? deepCopyTree(source.accessibility_overrides) : {},
    runtime_fallback: isPlainObject(source.runtime_fallback) ? deepCopyTree(source.runtime_fallback) : {},
    design_state: isPlainObject(source.design_state) ? deepCopyTree(source.design_state) : {},
    baseline_layout: createLayoutSnapshot(source.baseline_layout),
    current_layout: createLayoutSnapshot(source.current_layout || source.baseline_layout),
    last_stable_layout: createLayoutSnapshot(source.last_stable_layout || source.baseline_layout),
    form_configuration_snapshot: isPlainObject(source.form_configuration_snapshot)
      ? source.form_configuration_snapshot
      : null,
  };
}

function normalizeSupportedContext(input = {}, profiles = {}, workspaces = {}, runtimeState = {}) {
  const source = isPlainObject(input) ? input : {};
  const shellModes = Array.isArray(source.shell_modes) && source.shell_modes.length > 0
    ? source.shell_modes
    : Object.keys(isPlainObject(runtimeState.mode_overrides) ? runtimeState.mode_overrides : {});
  const profileIds = Array.isArray(source.profile_ids) && source.profile_ids.length > 0
    ? source.profile_ids
    : Object.keys(isPlainObject(profiles) ? profiles : {});
  const workspaceIds = Array.isArray(source.workspace_ids) && source.workspace_ids.length > 0
    ? source.workspace_ids
    : Object.keys(isPlainObject(workspaces) ? workspaces : {});
  const platformIds = Array.isArray(source.platform_ids) && source.platform_ids.length > 0
    ? source.platform_ids
    : Object.keys(isPlainObject(runtimeState.platform_overrides) ? runtimeState.platform_overrides : {});
  const accessibilityIds = Array.isArray(source.accessibility_ids) && source.accessibility_ids.length > 0
    ? source.accessibility_ids
    : Object.keys(isPlainObject(runtimeState.accessibility_overrides) ? runtimeState.accessibility_overrides : {});
  return {
    shell_modes: Object.freeze([...new Set(shellModes.map((entry) => normalizeString(entry)).filter(Boolean))].sort(stableCompare)),
    profile_ids: Object.freeze([...new Set(profileIds.map((entry) => normalizeString(entry)).filter(Boolean))].sort(stableCompare)),
    workspace_ids: Object.freeze([...new Set(workspaceIds.map((entry) => normalizeString(entry)).filter(Boolean))].sort(stableCompare)),
    platform_ids: Object.freeze([...new Set(platformIds.map((entry) => normalizeString(entry)).filter(Boolean))].sort(stableCompare)),
    accessibility_ids: Object.freeze([...new Set(accessibilityIds.map((entry) => normalizeString(entry)).filter(Boolean))].sort(stableCompare)),
  };
}

function cloneProfiles(input = {}) {
  return isPlainObject(input) ? deepCopyTree(input) : {};
}

function cloneWorkspaces(input = {}) {
  return isPlainObject(input) ? deepCopyTree(input) : {};
}

function normalizeProductTruth(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    project_id: normalizeTextString(source.project_id),
    scenes: isPlainObject(source.scenes) ? deepCopyTree(source.scenes) : {},
    active_scene_id: normalizeTextString(source.active_scene_id),
  };
}

export function createPreviewResult(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    resolved_tokens: isPlainObject(source.resolved_tokens) ? deepCopyTree(source.resolved_tokens) : {},
    layout: createLayoutSnapshot(source.layout),
    visible_commands: Array.isArray(source.visible_commands) ? Object.freeze([...source.visible_commands]) : Object.freeze([]),
    available_commands: Array.isArray(source.available_commands) ? Object.freeze([...source.available_commands]) : Object.freeze([]),
    degraded_to_baseline: source.degraded_to_baseline === true,
    product_hash: normalizeString(source.product_hash),
    resolver_calls: Number.isFinite(source.resolver_calls) ? Math.trunc(source.resolver_calls) : 0,
    form_configuration_revision: Number.isSafeInteger(source.form_configuration_revision)
      ? source.form_configuration_revision
      : 0,
    form_configuration_lifecycle: normalizeString(source.form_configuration_lifecycle) || 'STABLE',
  };
}

export class DesignOsRuntime {
  constructor({ productTruth, commandKernel, runtimeState, profiles, workspaces, supportedContext } = {}) {
    this.productTruth = normalizeProductTruth(productTruth);
    this.commandKernel = normalizeCommandKernel(commandKernel);
    this.runtimeState = normalizeRuntimeState(runtimeState);
    this.profiles = cloneProfiles(profiles);
    this.workspaces = cloneWorkspaces(workspaces);
    this.supportedContext = normalizeSupportedContext(supportedContext, this.profiles, this.workspaces, this.runtimeState);
    const formConfigurationInput = {
      baseline: {
        context: createRuntimeContext(),
        designState: {},
        layout: this.runtimeState.baseline_layout,
      },
    };
    if (this.runtimeState.form_configuration_snapshot) {
      formConfigurationInput.snapshot = this.runtimeState.form_configuration_snapshot;
    } else {
      formConfigurationInput.initial = {
        context: createRuntimeContext(),
        designState: this.runtimeState.design_state,
        layout: this.runtimeState.current_layout,
      };
    }
    this.formConfiguration = createDesignOsFormConfigurationController(formConfigurationInput);
    this.syncRuntimeStateFromFormConfiguration();
    this.resolverCalls = 0;
    this.previewCalls = 0;
    this.textInputEvents = 0;
  }

  syncRuntimeStateFromFormConfiguration() {
    const current = this.formConfiguration.getCurrentConfiguration();
    const lastStable = this.formConfiguration.getLastStableConfiguration();
    this.runtimeState.design_state = deepCopyTree(current.designState);
    this.runtimeState.current_layout = cloneLayoutSnapshot(current.layout);
    this.runtimeState.last_stable_layout = cloneLayoutSnapshot(lastStable.layout);
    return current;
  }

  assertSupportedContext(ctx) {
    const context = createRuntimeContext(ctx);
    if (!this.supportedContext.shell_modes.includes(context.shell_mode)) {
      throw new Error(`Unsupported shell_mode: ${context.shell_mode}`);
    }
    if (!this.supportedContext.profile_ids.includes(context.profile)) {
      throw new Error(`Unsupported profile: ${context.profile}`);
    }
    if (!this.supportedContext.workspace_ids.includes(context.workspace)) {
      throw new Error(`Unsupported workspace: ${context.workspace}`);
    }
    if (!this.supportedContext.platform_ids.includes(context.platform)) {
      throw new Error(`Unsupported platform: ${context.platform}`);
    }
    if (!this.supportedContext.accessibility_ids.includes(context.accessibility)) {
      throw new Error(`Unsupported accessibility: ${context.accessibility}`);
    }
  }

  getLayer(layerId, ctx) {
    const runtimeState = this.runtimeState;
    if (layerId === 'base') return runtimeState.base_tokens;
    if (layerId === 'mode') return runtimeState.mode_overrides[ctx.shell_mode] || {};
    if (layerId === 'profile') return runtimeState.profile_overrides[ctx.profile] || {};
    if (layerId === 'workspace') return runtimeState.workspace_overrides[ctx.workspace] || {};
    if (layerId === 'platform') return runtimeState.platform_overrides[ctx.platform] || {};
    if (layerId === 'accessibility_override') return runtimeState.accessibility_overrides[ctx.accessibility] || {};
    if (layerId === 'runtime_fallback') return runtimeState.runtime_fallback;
    if (layerId === 'design_state') return runtimeState.design_state;
    throw new Error(`Unknown design runtime layer: ${layerId}`);
  }

  resolveTokens(contextInput = {}, patch = null) {
    const ctx = createRuntimeContext(contextInput);
    this.assertSupportedContext(ctx);
    this.resolverCalls += 1;
    let tokens = {};
    for (const layerId of DESIGN_OS_RESOLVER_ORDER) {
      const layer = this.getLayer(layerId, ctx);
      tokens = layerId === 'runtime_fallback' ? deepFillMissing(tokens, layer) : deepMerge(tokens, layer);
    }
    if (patch) {
      validatePatch(patch, { allowedRoots: Object.keys(tokens) });
      tokens = deepMerge(tokens, patch);
    }
    validateRequiredTokens(tokens);
    return tokens;
  }

  normalizeLayout(layoutInput = {}) {
    const proposal = createLayoutSnapshot(layoutInput);
    const baseline = cloneLayoutSnapshot(this.runtimeState.baseline_layout);
    if (proposal.editor_root !== 'docked') {
      return { layout: baseline, degraded_to_baseline: true };
    }
    if (proposal.left_width < 0 || proposal.right_width < 0 || proposal.bottom_height < 0) {
      return { layout: baseline, degraded_to_baseline: true };
    }
    let normalized = cloneLayoutSnapshot(proposal);
    let degraded = false;
    const editorMinWidth = 640;
    const availableWidth = normalized.viewport_width - normalized.left_width - normalized.right_width;
    if (availableWidth < editorMinWidth) {
      normalized = {
        ...baseline,
        viewport_width: proposal.viewport_width,
        viewport_height: proposal.viewport_height,
        shell_mode: proposal.shell_mode,
      };
      degraded = true;
    }
    if (normalized.bottom_height > Math.floor(normalized.viewport_height / 2)) {
      normalized = {
        ...normalized,
        bottom_height: baseline.bottom_height,
      };
      degraded = true;
    }
    return { layout: normalized, degraded_to_baseline: degraded };
  }

  getVisibleCommands(profileId) {
    const profile = this.profiles[profileId] || null;
    if (!profile) {
      throw new Error(`Unknown profile: ${profileId}`);
    }
    const visible = new Set(Array.isArray(profile.visible_commands) ? profile.visible_commands : []);
    for (const hiddenId of Array.isArray(profile.hidden_commands) ? profile.hidden_commands : []) {
      visible.delete(hiddenId);
    }
    return [...visible].sort(stableCompare);
  }

  getAvailableCommands(visibleCommands, ctx) {
    return visibleCommands
      .filter((commandId) => this.commandKernel.isAvailable(commandId, ctx))
      .sort(stableCompare);
  }

  preview(contextInput = {}, options = {}) {
    const ctx = createRuntimeContext(contextInput);
    this.assertSupportedContext(ctx);
    const designPatch = isPlainObject(options.design_patch) ? options.design_patch : null;
    const layoutPatch = isPlainObject(options.layout_patch) ? options.layout_patch : null;
    if (layoutPatch) validateLayoutPatch(layoutPatch);
    const baseLayout = cloneLayoutSnapshot(this.runtimeState.current_layout);
    const candidateLayout = layoutPatch
      ? { ...baseLayout, ...layoutPatch, shell_mode: ctx.shell_mode }
      : { ...baseLayout, shell_mode: ctx.shell_mode };
    const { layout, degraded_to_baseline } = this.normalizeLayout(candidateLayout);
    const visible_commands = this.getVisibleCommands(ctx.profile);
    const available_commands = this.getAvailableCommands(visible_commands, ctx);
    this.previewCalls += 1;
    const formConfiguration = this.formConfiguration.getCurrentConfiguration();
    return createPreviewResult({
      resolved_tokens: this.resolveTokens(ctx, designPatch),
      layout,
      visible_commands,
      available_commands,
      degraded_to_baseline,
      product_hash: buildProductTruthHash(this.productTruth),
      resolver_calls: this.resolverCalls,
      form_configuration_revision: formConfiguration.revision,
      form_configuration_lifecycle: formConfiguration.lifecycle,
    });
  }

  commit(contextInput = {}, options = {}) {
    const ctx = createRuntimeContext(contextInput);
    this.assertSupportedContext(ctx);
    const commitPoint = normalizeString(options.commit_point) || 'apply';
    if (!DESIGN_OS_COMMIT_POINT_IDS.includes(commitPoint)) {
      throw new Error(`Unsupported commit point: ${commitPoint}`);
    }
    const designPatch = isPlainObject(options.design_patch) ? options.design_patch : null;
    const layoutPatch = isPlainObject(options.layout_patch) ? options.layout_patch : null;
    if (layoutPatch) validateLayoutPatch(layoutPatch);
    const beforeHash = buildProductTruthHash(this.productTruth);
    const preview = this.preview(ctx, {
      design_patch: designPatch,
      layout_patch: layoutPatch,
    });
    if (designPatch) validatePatch(designPatch, { allowedRoots: Object.keys(this.resolveTokens(ctx)) });
    const currentConfiguration = this.formConfiguration.getCurrentConfiguration();
    const contextChanged = !sameRuntimeContext(ctx, currentConfiguration.context);
    if (designPatch || layoutPatch || contextChanged) {
      const nextDesignState = designPatch
        ? deepMerge(this.runtimeState.design_state, designPatch)
        : deepCopyTree(this.runtimeState.design_state);
      const nextLayout = layoutPatch
        ? cloneLayoutSnapshot(preview.degraded_to_baseline ? this.runtimeState.baseline_layout : preview.layout)
        : cloneLayoutSnapshot(contextChanged ? preview.layout : this.runtimeState.current_layout);
      const staged = this.formConfiguration.stage({
        expectedRevision: currentConfiguration.revision,
        commitPoint,
        context: ctx,
        designState: nextDesignState,
        layout: nextLayout,
      });
      if (!(layoutPatch && preview.degraded_to_baseline)) {
        this.formConfiguration.promoteStable(staged.revision);
      }
      const committedConfiguration = this.syncRuntimeStateFromFormConfiguration();
      const afterHash = buildProductTruthHash(this.productTruth);
      if (beforeHash !== afterHash) {
        throw new Error('Design OS commit mutated product truth.');
      }
      return createPreviewResult({
        ...preview,
        form_configuration_revision: committedConfiguration.revision,
        form_configuration_lifecycle: committedConfiguration.lifecycle,
      });
    }
    const afterHash = buildProductTruthHash(this.productTruth);
    if (beforeHash !== afterHash) {
      throw new Error('Design OS commit mutated product truth.');
    }
    return preview;
  }

  safeReset() {
    const current = this.formConfiguration.getCurrentConfiguration();
    this.formConfiguration.safeReset(current.revision);
    const reset = this.syncRuntimeStateFromFormConfiguration();
    return cloneLayoutSnapshot(reset.layout);
  }

  restoreLastStable() {
    const current = this.formConfiguration.getCurrentConfiguration();
    this.formConfiguration.rollback(current.revision);
    const restored = this.syncRuntimeStateFromFormConfiguration();
    return cloneLayoutSnapshot(restored.layout);
  }

  getSnapshot() {
    return {
      product_truth: deepCopyTree(this.productTruth),
      current_layout: cloneLayoutSnapshot(this.runtimeState.current_layout),
      last_stable_layout: cloneLayoutSnapshot(this.runtimeState.last_stable_layout),
      baseline_layout: cloneLayoutSnapshot(this.runtimeState.baseline_layout),
      design_state: deepCopyTree(this.runtimeState.design_state),
      form_configuration_snapshot: this.formConfiguration.getSnapshot(),
      form_configuration_recovery: this.formConfiguration.getRecoveryReceipt(),
      resolver_calls: this.resolverCalls,
      preview_calls: this.previewCalls,
      text_input_events: this.textInputEvents,
      supported_context: {
        shell_modes: [...this.supportedContext.shell_modes],
        profile_ids: [...this.supportedContext.profile_ids],
        workspace_ids: [...this.supportedContext.workspace_ids],
        platform_ids: [...this.supportedContext.platform_ids],
        accessibility_ids: [...this.supportedContext.accessibility_ids],
      },
    };
  }

  onTextInput(text) {
    this.textInputEvents += 1;
    return String(text || '').length;
  }
}

export function createDesignOsRuntime(input = {}) {
  return new DesignOsRuntime(input);
}
