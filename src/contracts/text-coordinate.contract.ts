// Public contract: strict text-coordinate domains and immutable index descriptor.

export type TextCoordinateDomain =
  | "UTF16_JS_CODE_UNIT"
  | "UNICODE_CODE_POINT"
  | "GRAPHEME_CLUSTER"

export type TextCoordinateIndexDescriptor = Readonly<{
  schemaVersion: "core.textCoordinateIndex.v1"
  offsetDomains: readonly [
    "UTF16_JS_CODE_UNIT",
    "UNICODE_CODE_POINT",
    "GRAPHEME_CLUSTER",
  ]
  adapterOffsetDomain: "UTF16_JS_CODE_UNIT"
  segmentationProvider: "Intl.Segmenter"
  segmentationLocale: "und"
  segmentationGranularity: "grapheme"
  utf16Length: number
  codePointLength: number
  graphemeLength: number
}>

export type TextCoordinateRange = Readonly<{
  start: number
  end: number
  length: number
}>

export type TextCoordinateErrorCode =
  | "E_TEXT_COORDINATE_INVALID"
  | "E_TEXT_COORDINATE_INDEX_INVALID"
  | "E_TEXT_COORDINATE_INDEX_MISMATCH"
  | "E_TEXT_COORDINATE_NOT_BOUNDARY"
  | "E_TEXT_COORDINATE_OUT_OF_RANGE"
  | "E_TEXT_COORDINATE_RANGE_INVALID"
  | "E_TEXT_COORDINATE_SEGMENTER_UNAVAILABLE"
