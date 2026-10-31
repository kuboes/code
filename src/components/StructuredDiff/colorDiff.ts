import {
  ColorDiff,
  ColorFile,
  getSyntaxTheme as nativeGetSyntaxTheme,
  type SyntaxTheme,
} from 'color-diff-napi'
import { isEnvDefinedFalsy } from '../../utils/envUtils.js'

export type ColorModuleUnavailableReason = 'env'

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via CLAUDE_CODE_SYNTAX_HIGHLIGHT
 *
 * The TS port of color-diff works in all build modes, so the only way to
 * disable it is via the env var.
 */
export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT)) {
    return 'env'
  }
  return null
}

// kuboes patch (Termux / source-run): the setup script stubs color-diff-napi
// with plain objects (ColorDiff = {}). That is not a constructor, so
// `new ColorDiff(...)` in StructuredDiff.tsx / HighlightedCode.tsx throws
// "Object is not a constructor". Treat a non-function export as unavailable
// so callers fall back to StructuredDiffFallback / HighlightedCodeFallback
// instead of crashing. The real NAPI module exports classes, so this
// check is a no-op when it is present.
function isColorModuleUsable(): boolean {
  return typeof ColorDiff === 'function' && typeof ColorFile === 'function'
}

export function expectColorDiff(): typeof ColorDiff | null {
  return getColorModuleUnavailableReason() === null && isColorModuleUsable()
    ? ColorDiff
    : null
}

export function expectColorFile(): typeof ColorFile | null {
  return getColorModuleUnavailableReason() === null && isColorModuleUsable()
    ? ColorFile
    : null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  return getColorModuleUnavailableReason() === null && isColorModuleUsable()
    ? nativeGetSyntaxTheme(themeName)
    : null
}
