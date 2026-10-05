/**
 * Shannon Entropy Calculation Module
 * 
 * Computes Shannon entropy over byte distributions of request payloads:
 * H(X) = - \sum_{i=1}^{n} P(x_i) \log_2 P(x_i)
 * 
 * Output range: [0.0, 8.0] bits per byte.
 */

function calculateShannonEntropy(data) {
  if (data === null || data === undefined) {
    return 0.0;
  }

  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (typeof data === 'string') {
    if (data.length === 0) return 0.0;
    buffer = Buffer.from(data, 'utf8');
  } else if (typeof data === 'object') {
    try {
      const serialized = JSON.stringify(data);
      if (!serialized || serialized.length === 0) return 0.0;
      buffer = Buffer.from(serialized, 'utf8');
    } catch {
      return 0.0;
    }
  } else {
    buffer = Buffer.from(String(data), 'utf8');
  }

  const length = buffer.length;
  if (length === 0) {
    return 0.0;
  }

  // Count byte frequencies
  const frequencies = new Uint32Array(256);
  for (let i = 0; i < length; i++) {
    frequencies[buffer[i]]++;
  }

  // Compute Shannon entropy
  let entropy = 0.0;
  for (let i = 0; i < 256; i++) {
    const count = frequencies[i];
    if (count > 0) {
      const p = count / length;
      entropy -= p * Math.log2(p);
    }
  }

  // Clamp within [0.0, 8.0] and format to 4 decimal places
  const clamped = Math.min(8.0, Math.max(0.0, entropy));
  return Math.round(clamped * 10000) / 10000;
}

module.exports = {
  calculateShannonEntropy
};
