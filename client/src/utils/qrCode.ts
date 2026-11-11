/**
 * Pure TypeScript QR Code Generator (ISO/IEC 18004 compliant)
 * Zero external dependencies. Self-contained SVG QR code generator.
 * Supports Versions 1 to 7 in Byte mode with full 8-mask penalty evaluation.
 */

// Error correction levels: Low (7%), Medium (15%), Quartile (25%), High (30%)
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

// GF(2^8) Galois Field with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D / 285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val & 128 ? 285 : 0);
  }
  LOG_TABLE[0] = 0;
})();

export function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

/**
 * Computes Reed-Solomon generator polynomial of degree `degree` in DESCENDING order of powers:
 * g(x) = x^d + g_{d-1}x^{d-1} + ... + g_1 x + g_0
 * gen[0] = 1 (coefficient of x^d)
 * gen[d] = g_0 (constant term)
 */
export function rsComputeGenerator(degree: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = EXP_TABLE[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]; // gen[j] * x
      next[j + 1] ^= gfMul(gen[j], root); // gen[j] * root
    }
    gen = next;
  }
  return gen;
}

/**
 * Computes Reed-Solomon error correction codewords using polynomial division (LFSR).
 * Remainder is in descending order of powers [r_{d-1}, r_{d-2}, ..., r_0].
 */
export function rsCalculateRemainder(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsComputeGenerator(degree);
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < degree - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(factor, gen[j + 1]);
    }
    rem[degree - 1] = gfMul(factor, gen[degree]);
  }
  return rem;
}

// QR Version parameters: [version, totalCodewords, [ecCodewords, numBlocksL, numBlocksM]]
// Versions 1 to 7 supported (holds up to 154 alphanumeric / 122 bytes in Level M)
export interface VersionInfo {
  version: number;
  totalCodewords: number;
  ecCodewordsPerBlock: { L: number; M: number };
  numBlocks: { L: number; M: number };
  alignments: number[];
}

export const VERSIONS: VersionInfo[] = [
  { version: 1, totalCodewords: 26, ecCodewordsPerBlock: { L: 7, M: 10 }, numBlocks: { L: 1, M: 1 }, alignments: [] },
  { version: 2, totalCodewords: 44, ecCodewordsPerBlock: { L: 10, M: 16 }, numBlocks: { L: 1, M: 1 }, alignments: [6, 18] },
  { version: 3, totalCodewords: 70, ecCodewordsPerBlock: { L: 15, M: 26 }, numBlocks: { L: 1, M: 1 }, alignments: [6, 22] },
  { version: 4, totalCodewords: 100, ecCodewordsPerBlock: { L: 20, M: 18 }, numBlocks: { L: 1, M: 2 }, alignments: [6, 26] },
  { version: 5, totalCodewords: 134, ecCodewordsPerBlock: { L: 26, M: 24 }, numBlocks: { L: 1, M: 2 }, alignments: [6, 30] },
  { version: 6, totalCodewords: 172, ecCodewordsPerBlock: { L: 18, M: 16 }, numBlocks: { L: 2, M: 4 }, alignments: [6, 34] },
  { version: 7, totalCodewords: 196, ecCodewordsPerBlock: { L: 20, M: 18 }, numBlocks: { L: 2, M: 4 }, alignments: [6, 22, 38] },
];

/**
 * Computes 15-bit format info using BCH (15, 5) code masked with 0x5412 (ISO/IEC 18004 §6.9)
 * eclBits: L = 1 (0b01), M = 0 (0b00)
 */
export function computeFormatInfoBits(eclBits: number, mask: number): number {
  const data = ((eclBits & 0x3) << 3) | (mask & 0x7);
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem >> (i + 10)) & 1) {
      rem ^= (0x537 << i);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

// Precomputed Format info strings for Level L (01) and Level M (00) across masks 0-7
export const FORMAT_INFO_TABLE: Record<'L' | 'M', number[]> = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0]
};

// Eight ISO/IEC 18004 standard mask condition formulas
export const MASK_FORMULAS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number, c: number) => r % 2 === 0,
  (r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/**
 * Writes 15-bit format information to matrix while strictly preserving the mandatory Dark Module.
 */
export function writeFormatInfoToMatrix(matrix: boolean[][], size: number, formatVal: number): void {
  for (let i = 0; i < 15; i++) {
    const bit = ((formatVal >> (14 - i)) & 1) === 1;

    // Copy 1: Around Top-Left Finder
    if (i < 6) {
      matrix[8][i] = bit;
    } else if (i === 6) {
      matrix[8][7] = bit;
    } else if (i === 7) {
      matrix[8][8] = bit;
    } else if (i === 8) {
      matrix[7][8] = bit;
    } else {
      matrix[14 - i][8] = bit;
    }

    // Copy 2: Split between Bottom-Left (7 bits) and Top-Right (8 bits)
    // QR-02 Fix: i = 0..6 placed on (size - 1 - i, 8). Coordinate (size - 8, 8) is the mandatory
    // Dark Module and is NEVER overwritten. i = 7..14 placed on (8, size - 15 + i).
    if (i < 7) {
      matrix[size - 1 - i][8] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
  }
}

/**
 * Evaluates ISO/IEC 18004 §6.8.2 penalty score (N1, N2, N3, N4) on a complete QR matrix.
 */
export function evaluateMaskPenalty(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;

  // N1: Runs of >= 5 consecutive modules of same color (rows and cols)
  for (let r = 0; r < size; r++) {
    let runColor = matrix[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let c = 0; c < size; c++) {
    let runColor = matrix[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // N2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = matrix[r][c];
      if (color === matrix[r + 1][c] && color === matrix[r][c + 1] && color === matrix[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // N3: 1:1:3:1:1 pattern with 4 white modules: 00001011101 or 10111010000
  const pat1 = [false, false, false, false, true, false, true, true, true, false, true];
  const pat2 = [true, false, true, true, true, false, true, false, false, false, false];

  const checkPattern = (arr: boolean[]) => {
    let count = 0;
    for (let i = 0; i <= arr.length - 11; i++) {
      let m1 = true, m2 = true;
      for (let k = 0; k < 11; k++) {
        if (arr[i + k] !== pat1[k]) m1 = false;
        if (arr[i + k] !== pat2[k]) m2 = false;
        if (!m1 && !m2) break;
      }
      if (m1) count++;
      if (m2) count++;
    }
    return count;
  };

  for (let r = 0; r < size; r++) {
    penalty += checkPattern(matrix[r]) * 40;
  }
  for (let c = 0; c < size; c++) {
    const colArr: boolean[] = [];
    for (let r = 0; r < size; r++) colArr.push(matrix[r][c]);
    penalty += checkPattern(colArr) * 40;
  }

  // N4: Ratio of dark modules to total modules
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) darkCount++;
    }
  }
  const total = size * size;
  const pct = (darkCount / total) * 100;
  const k = Math.floor(Math.abs(pct - 50) / 5);
  penalty += k * 10;

  return penalty;
}

/**
 * Generates an authoritative, fully specification-compliant QR Matrix.
 */
export function generateQrMatrix(text: string, ecl: 'L' | 'M' = 'M'): boolean[][] {
  const utf8Encoder = new TextEncoder();
  const textBytes = utf8Encoder.encode(text);
  const dataLen = textBytes.length;

  // Find minimum version that fits data in Byte mode
  // Byte mode header: 4 bits mode + 8 bits length = 12 bits (1.5 bytes)
  let chosenVersion: VersionInfo | null = null;
  for (const v of VERSIONS) {
    const dataCapacity = v.totalCodewords - v.ecCodewordsPerBlock[ecl] * v.numBlocks[ecl];
    if (dataLen + 2 <= dataCapacity) {
      chosenVersion = v;
      break;
    }
  }

  // QR-05 Fix: Controlled overflow rejection
  if (!chosenVersion) {
    const maxVersion = VERSIONS[VERSIONS.length - 1];
    const maxCapacity = maxVersion.totalCodewords - maxVersion.ecCodewordsPerBlock[ecl] * maxVersion.numBlocks[ecl] - 2;
    throw new Error(`QR payload exceeds maximum supported capacity of ${maxCapacity} bytes for error correction level '${ecl}' (received ${dataLen} bytes).`);
  }

  const ecBlockCodewords = chosenVersion.ecCodewordsPerBlock[ecl];
  const numBlocks = chosenVersion.numBlocks[ecl];
  const totalDataCodewords = chosenVersion.totalCodewords - ecBlockCodewords * numBlocks;

  // 1. Bitstream assembly: Mode (0100 for Byte) + Count (8 bits) + Data + Terminator
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1-9)
  pushBits(dataLen, 8);
  // Payload bytes
  for (let i = 0; i < dataLen; i++) {
    pushBits(textBytes[i], 8);
  }
  // Terminator: up to 4 zero bits
  const bitCapacity = totalDataCodewords * 8;
  const termLen = Math.min(4, Math.max(0, bitCapacity - bits.length));
  pushBits(0, termLen);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes: alternate 0xEC and 0x11
  let padByte = 0xec;
  while (bits.length < bitCapacity) {
    pushBits(padByte, 8);
    padByte = padByte === 0xec ? 0x11 : 0xec;
  }

  // Convert bits to byte array
  const dataBytes = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < totalDataCodewords; i++) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = byteVal;
  }

  // 2. Block division & Reed-Solomon Error Correction (QR-01 Fix)
  const shortBlockDataLen = Math.floor(totalDataCodewords / numBlocks);
  const numLongBlocks = totalDataCodewords % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const curLen = b < numShortBlocks ? shortBlockDataLen : shortBlockDataLen + 1;
    const blockData = dataBytes.slice(offset, offset + curLen);
    offset += curLen;
    dataBlocks.push(blockData);
    ecBlocks.push(rsCalculateRemainder(blockData, ecBlockCodewords));
  }

  // 3. Interleaving data and error correction codewords
  const finalCodewords = new Uint8Array(chosenVersion.totalCodewords);
  let finalIdx = 0;

  // Interleave data bytes
  const maxDataLen = shortBlockDataLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords[finalIdx++] = dataBlocks[b][i];
      }
    }
  }

  // Interleave EC bytes
  for (let i = 0; i < ecBlockCodewords; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalCodewords[finalIdx++] = ecBlocks[b][i];
    }
  }

  // 4. Matrix creation & Function Module placement
  const size = chosenVersion.version * 4 + 17;
  const baseMatrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    baseMatrix[r][c] = val;
    isFunction[r][c] = true;
  };

  // Place Finder Pattern with separator
  const placeFinder = (startRow: number, startCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startRow + r;
        const col = startCol + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(row, col, isBlack);
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns (QR-03 Fix)
  const aligns = chosenVersion.alignments;
  if (aligns.length > 0) {
    for (let i = 0; i < aligns.length; i++) {
      for (let j = 0; j < aligns.length; j++) {
        const r = aligns[i];
        const c = aligns[j];

        // Check if 5x5 alignment pattern (centered at r, c) overlaps with finder patterns & separators
        // Finder zones (including 1-module separator):
        // Top-left: [0..8, 0..8]
        // Top-right: [0..8, size-9..size-1]
        // Bottom-left: [size-9..size-1, 0..8]
        const overlapsTopLeft = (r - 2 <= 8) && (c - 2 <= 8);
        const overlapsTopRight = (r - 2 <= 8) && (c + 2 >= size - 9);
        const overlapsBottomLeft = (r + 2 >= size - 9) && (c - 2 <= 8);

        if (overlapsTopLeft || overlapsTopRight || overlapsBottomLeft) {
          continue;
        }

        // Place 5x5 alignment pattern (overlays timing lines without skipping)
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // Mandatory Dark module at (4*V + 9, 8) = (size - 8, 8) (QR-02 Fix)
  setModule(chosenVersion.version * 4 + 9, 8, true);

  // Reserve format info modules
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isFunction[8][i] = true;
    isFunction[i][8] = true;
  }

  // Reserve and place Version Information modules for versions >= 7 (ISO/IEC 18004 §6.10)
  if (chosenVersion.version >= 7) {
    const vVal = 0x07c94; // Version 7 BCH (18, 6) code
    for (let i = 0; i < 18; i++) {
      const bit = ((vVal >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = i % 3;
      // Bottom-left block: columns 0..5, rows size - 11 .. size - 9
      setModule(size - 11 + b, a, bit);
      // Top-right block: rows 0..5, columns size - 11 .. size - 9
      setModule(a, size - 11 + b, bit);
    }
  }

  // 5. Place unmasked raw data bits in upward/downward 2-column paths
  const rawDataMatrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  let bitIdx = 0;
  const totalDataBits = finalCodewords.length * 8;
  let up = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip timing column
    const rows = up
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (!isFunction[row][c]) {
          let bit = false;
          if (bitIdx < totalDataBits) {
            const byte = finalCodewords[Math.floor(bitIdx / 8)];
            bit = ((byte >> (7 - (bitIdx % 8))) & 1) === 1;
            bitIdx++;
          }
          rawDataMatrix[row][c] = bit;
        }
      }
    }
    up = !up;
  }

  // 6. Evaluate all 8 candidate masks and select lowest-penalty mask (QR-04 Fix)
  let bestMask = 0;
  let lowestPenalty = Infinity;
  let bestMatrix: boolean[][] = [];

  const eclBits = ecl === 'L' ? 1 : 0;

  for (let maskIdx = 0; maskIdx < 8; maskIdx++) {
    const maskFn = MASK_FORMULAS[maskIdx];
    const candidateMatrix: boolean[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        if (isFunction[r][c]) {
          return baseMatrix[r][c];
        }
        // Invert bit if mask condition is true
        return maskFn(r, c) ? !rawDataMatrix[r][c] : rawDataMatrix[r][c];
      })
    );

    // Apply format information for this candidate mask
    const formatVal = FORMAT_INFO_TABLE[ecl][maskIdx];
    writeFormatInfoToMatrix(candidateMatrix, size, formatVal);

    // Calculate penalty for full candidate matrix (N1, N2, N3, N4)
    const penalty = evaluateMaskPenalty(candidateMatrix);
    if (penalty < lowestPenalty) {
      lowestPenalty = penalty;
      bestMask = maskIdx;
      bestMatrix = candidateMatrix;
    }
  }

  return bestMatrix;
}

/**
 * Generates an optimized, crisp SVG string for the QR code.
 * Adheres to ISO/IEC 18004 §6.3.7 with a standard 4-module quiet zone,
 * pure black foreground (#000000), pure white background (#ffffff),
 * and sharp square module geometry.
 */
export function generateQrCodeSvg(text: string, size = 110, ecl: 'L' | 'M' = 'M'): string {
  const matrix = generateQrMatrix(text, ecl);
  const moduleCount = matrix.length;
  const margin = 4; // Standard ISO/IEC 18004 4-module quiet zone
  const totalModules = moduleCount + margin * 2;

  let pathD = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        pathD += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <path d="${pathD}" fill="#000000"/>
    </svg>
  `.trim();
}
