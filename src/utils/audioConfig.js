/**
 * Audio Processing Configuration
 * Settings for RNNoise, Compressor, and other audio effects
 */

export const AUDIO_CONFIG = {
  // RNNoise settings
  rnnoise: {
    enabled: true,
    description: 'ML-based noise suppression using RNNoise WASM'
  },

  // Compressor (DynamicsCompressor) settings
  compressor: {
    threshold: -50, // dB - level above which compression starts
    knee: 40, // dB - smooth transition range
    ratio: 12, // compression ratio (how much to compress)
    attack: 0.003, // seconds - how fast to respond to level changes
    release: 0.25, // seconds - how fast to stop compressing
    description: 'Dynamic range compression for consistent audio levels'
  },

  // Noise Gate settings
  noiseGate: {
    defaultThreshold: -50, // dB - below this, audio is muted
    description: 'Mutes audio below threshold (prevents background noise)'
  },

  // Manual Gain settings
  gain: {
    min: 0.1,
    max: 2.0,
    default: 1.0,
    description: 'Manual volume amplification'
  }
};

/**
 * Get recommended compressor settings based on use case
 */
export const getCompressorPresets = () => ({
  aggressive: {
    threshold: -40,
    knee: 30,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
    description: 'Strong compression - flattens volume variations'
  },
  balanced: {
    threshold: -50,
    knee: 40,
    ratio: 12,
    attack: 0.003,
    release: 0.25,
    description: 'Default - good balance between clarity and normalization'
  },
  gentle: {
    threshold: -60,
    knee: 50,
    ratio: 4,
    attack: 0.01,
    release: 0.5,
    description: 'Subtle compression - preserves audio character'
  }
});

/**
 * Helper to describe current audio chain
 */
export const getAudioChainDescription = (settings) => {
  const chain = [];

  if (settings.useRNNoise) {
    chain.push('🔇 RNNoise (ML Noise Suppression)');
  }

  chain.push('📊 DynamicsCompressor');
  chain.push('🔔 NoiseGate');
  chain.push('🔊 ManualGain');

  return chain.join(' → ');
};
