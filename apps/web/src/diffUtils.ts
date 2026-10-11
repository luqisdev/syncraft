import { DiffLine } from './historyTypes';

/**
 * Compute line-by-line diff using standard Longest Common Subsequence (LCS).
 * Suitable for text comparison between historical version and current live document.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  const m = oldLines.length;
  const n = newLines.length;

  // dp table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }

  return result;
}

/**
 * Extract plain text from a Y.Doc XML fragment (default) for snapshot and recovery comparison.
 */
export function extractPlainTextFromYDoc(doc: any): string {
  if (!doc) return '';
  try {
    const frag = doc.getXmlFragment('default');
    if (!frag) return '';
    return extractTextFromXmlNode(frag).trim();
  } catch (_e) {
    return '';
  }
}

function extractTextFromXmlNode(node: any): string {
  if (!node) return '';
  const cName = node.constructor?.name || '';
  if (typeof node.toString === 'function' && (cName === 'XmlText' || cName === 'YXmlText' || node._searchMarker !== undefined || node._str !== undefined)) {
    return node.toString();
  }
  if (node.length !== undefined) {
    let out = '';
    for (let i = 0; i < node.length; i++) {
      const child = node.get(i);
      out += extractTextFromXmlNode(child);
    }
    return out + (cName === 'XmlElement' || cName === 'YXmlElement' || node.nodeName ? '\n' : '');
  }
  return '';
}
