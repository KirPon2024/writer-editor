import {
  cloneLayoutSnapshot,
  createRuntimeContext,
  deepCopyTree,
} from './designOsRuntime.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializePreview(result) {
  return {
    resolved_tokens: deepCopyTree(result.resolved_tokens),
    layout: cloneLayoutSnapshot(result.layout),
    visible_commands: [...result.visible_commands],
    available_commands: [...result.available_commands],
    degraded_to_baseline: result.degraded_to_baseline === true,
    product_hash: result.product_hash,
    resolver_calls: result.resolver_calls,
    form_configuration_revision: result.form_configuration_revision,
    form_configuration_lifecycle: result.form_configuration_lifecycle,
  };
}

function normalizeContext(defaultContext, nextContext) {
  return createRuntimeContext({
    ...defaultContext,
    ...(isPlainObject(nextContext) ? nextContext : {}),
  });
}

export function createDesignOsPorts(input = {}) {
  const runtime = input.runtime || null;
  if (!runtime || typeof runtime.preview !== 'function' || typeof runtime.commit !== 'function') {
    throw new Error('Design OS ports require a valid runtime instance.');
  }

  const defaultContext = createRuntimeContext(input.defaultContext);

  return Object.freeze({
    getDefaultContext() {
      return { ...defaultContext };
    },
    previewDesign(options = {}) {
      const context = normalizeContext(defaultContext, options.context);
      return serializePreview(runtime.preview(context, {
        design_patch: options.design_patch,
        layout_patch: options.layout_patch,
      }));
    },
    commitDesign(options = {}) {
      const context = normalizeContext(defaultContext, options.context);
      return serializePreview(runtime.commit(context, {
        design_patch: options.design_patch,
        layout_patch: options.layout_patch,
        commit_point: options.commit_point,
      }));
    },
    safeResetShell() {
      return cloneLayoutSnapshot(runtime.safeReset());
    },
    restoreLastStableShell() {
      return cloneLayoutSnapshot(runtime.restoreLastStable());
    },
    onTextInput(text) {
      return runtime.onTextInput(text);
    },
    getRuntimeSnapshot() {
      const snapshot = runtime.getSnapshot();
      return {
        product_truth: deepCopyTree(snapshot.product_truth),
        current_layout: cloneLayoutSnapshot(snapshot.current_layout),
        last_stable_layout: cloneLayoutSnapshot(snapshot.last_stable_layout),
        baseline_layout: cloneLayoutSnapshot(snapshot.baseline_layout),
        design_state: deepCopyTree(snapshot.design_state),
        form_configuration_snapshot: deepCopyTree(snapshot.form_configuration_snapshot),
        form_configuration_recovery: deepCopyTree(snapshot.form_configuration_recovery),
        resolver_calls: snapshot.resolver_calls,
        preview_calls: snapshot.preview_calls,
        text_input_events: snapshot.text_input_events,
        supported_context: deepCopyTree(snapshot.supported_context || {}),
      };
    },
  });
}
