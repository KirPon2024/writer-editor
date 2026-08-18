// Public contract: verified revision-bound UTF-16 transform tapes and fail-closed mapping.

export type TextTransformDirection = "FORWARD" | "INVERSE"
export type TextTransformAffinity = "BEFORE" | "AFTER"
export type TextTransformOperationKind = "INSERT" | "DELETE" | "REPLACE"

export type TextTransformOperationDescriptor = Readonly<{
  operationIndex: number
  kind: TextTransformOperationKind
  sourceStart: number
  sourceEnd: number
  sourceUtf16Length: number
  targetStart: number
  targetEnd: number
  targetUtf16Length: number
  deletedTextHash: string
  insertedTextHash: string
}>

export type TextTransformTapeDescriptor = Readonly<{
  schemaVersion: "core.textTransformTape.v1"
  algorithmId: "core.textTransformAlgebra"
  algorithmVersion: 1
  coordinateDomain: "UTF16_JS_CODE_UNIT"
  boundaryPolicy: "UNICODE_CODE_POINT_BOUNDARIES"
  textNormalization: "EXACT_NO_NORMALIZATION"
  sourceRevisionId: string
  targetRevisionId: string
  sourceTextHash: string
  targetTextHash: string
  sourceUtf16Length: number
  targetUtf16Length: number
  operationCount: number
  operations: readonly TextTransformOperationDescriptor[]
  tapeId: string
}>

export type TextTransformRouteDescriptor = Readonly<{
  schemaVersion: "core.textTransformRoute.v1"
  algorithmId: "core.textTransformAlgebra"
  algorithmVersion: 1
  coordinateDomain: "UTF16_JS_CODE_UNIT"
  boundaryPolicy: "UNICODE_CODE_POINT_BOUNDARIES"
  textNormalization: "EXACT_NO_NORMALIZATION"
  sourceRevisionId: string
  targetRevisionId: string
  sourceTextHash: string
  targetTextHash: string
  sourceUtf16Length: number
  targetUtf16Length: number
  tapeCount: number
  tapeIds: readonly string[]
  routeId: string
}>

export type TextTransformDescriptor =
  | TextTransformTapeDescriptor
  | TextTransformRouteDescriptor

export type TextTransformPositionMapResult = Readonly<{
  schemaVersion: "core.textTransformPositionMapResult.v1"
  transformKind: "TAPE" | "ROUTE"
  transformId: string
  direction: TextTransformDirection
  affinity: TextTransformAffinity
  inputRevisionId: string
  inputTextHash: string
  inputPosition: number
  requestedOutputRevisionId: string
  requestedOutputTextHash: string
  traversedTapeCount: number
} & (
  | {
      status: "EXACT"
      outputRevisionId: string
      outputTextHash: string
      outputPosition: number
    }
  | {
      status: "UNMAPPABLE"
      reason: "POSITION_INSIDE_REMOVED_SOURCE_RANGE" | "POSITION_INSIDE_INSERTED_TARGET_RANGE"
      failedTapeIndex: number
      failedOperationIndex: number
    }
)>

export type TextTransformBoundaryMapResult = Readonly<
  | {
      status: "EXACT"
      inputPosition: number
      outputPosition: number
    }
  | {
      status: "UNMAPPABLE"
      inputPosition: number
      reason: "POSITION_INSIDE_REMOVED_SOURCE_RANGE" | "POSITION_INSIDE_INSERTED_TARGET_RANGE"
      failedTapeIndex: number
      failedOperationIndex: number
    }
>

export type TextTransformContentImpact =
  | "UNCHANGED"
  | "INPUT_CONTENT_REMOVED"
  | "OUTPUT_CONTENT_INSERTED"
  | "INPUT_REMOVED_AND_OUTPUT_INSERTED"
  | "UNKNOWN_UNMAPPABLE_BOUNDARY"

export type TextTransformRangeMapResult = Readonly<{
  schemaVersion: "core.textTransformRangeMapResult.v1"
  transformKind: "TAPE" | "ROUTE"
  transformId: string
  direction: TextTransformDirection
  inputRevisionId: string
  inputTextHash: string
  requestedOutputRevisionId: string
  requestedOutputTextHash: string
  inputRange: Readonly<{ start: number; end: number; length: number }>
  startAffinity: TextTransformAffinity
  endAffinity: TextTransformAffinity
  traversedTapeCount: number
  startBoundary: TextTransformBoundaryMapResult
  endBoundary: TextTransformBoundaryMapResult
  contentImpact: TextTransformContentImpact
  contentPreserved: boolean
  touchedTapeIndexes: readonly number[]
} & (
  | {
      status: "EXACT"
      outputRevisionId: string
      outputTextHash: string
      outputRange: Readonly<{ start: number; end: number; length: number }>
    }
  | {
      status: "UNMAPPABLE"
      reason:
        | "START_BOUNDARY_UNMAPPABLE"
        | "END_BOUNDARY_UNMAPPABLE"
        | "BOTH_BOUNDARIES_UNMAPPABLE"
        | "BOUNDARY_AFFINITIES_INVERT_OUTPUT_RANGE"
    }
)>

export type TextTransformErrorCode =
  | "E_TEXT_TRANSFORM_INVALID"
  | "E_TEXT_TRANSFORM_OUT_OF_RANGE"
  | "E_TEXT_TRANSFORM_UNICODE_INVALID"
  | "E_TEXT_TRANSFORM_OPERATION_INVALID"
  | "E_TEXT_TRANSFORM_OPERATION_ORDER"
  | "E_TEXT_TRANSFORM_TARGET_MISMATCH"
  | "E_TEXT_TRANSFORM_DESCRIPTOR_INVALID"
  | "E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY"
  | "E_TEXT_TRANSFORM_REVISION_MISMATCH"
  | "E_TEXT_TRANSFORM_RANGE_INVALID"
