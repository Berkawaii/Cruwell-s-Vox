/**
 * RNNoise AudioWorklet Processor
 * Processes audio in real-time using RNNoise WASM for noise suppression
 */

import { RNNoise } from '@jitsi/rnnoise-wasm';

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.rnnoise = null;
    this.isInitialized = false;
    this.frameSize = 480; // RNNoise frame size for 48kHz (10ms)
    this.inputBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;

    // Initialize RNNoise
    this.initRNNoise();

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'enable') {
        this.enabled = event.data.enabled;
      }
    };

    this.enabled = true;
  }

  async initRNNoise() {
    try {
      // Initialize the RNNoise WASM module
      await RNNoise.initWasm();
      this.rnnoise = new RNNoise();
      this.isInitialized = true;
      console.log('RNNoise initialized successfully');
      this.port.postMessage({ type: 'initialized' });
    } catch (error) {
      console.error('Failed to initialize RNNoise:', error);
      this.port.postMessage({ type: 'error', message: error.message });
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.isInitialized || !this.enabled) {
      // Pass through if not initialized or disabled
      if (inputs[0] && inputs[0][0]) {
        outputs[0][0].set(inputs[0][0]);
      }
      return true;
    }

    const input = inputs[0][0];
    const output = outputs[0][0];

    if (!input) {
      output.fill(0);
      return true;
    }

    // Process audio frame by frame (RNNoise requires fixed 480-sample frames)
    let inputIndex = 0;

    while (inputIndex < input.length) {
      // Fill the input buffer
      const samplesToRead = Math.min(
        this.frameSize - this.bufferIndex,
        input.length - inputIndex
      );

      this.inputBuffer.set(
        input.subarray(inputIndex, inputIndex + samplesToRead),
        this.bufferIndex
      );

      this.bufferIndex += samplesToRead;
      inputIndex += samplesToRead;

      // Process when we have a complete frame
      if (this.bufferIndex === this.frameSize) {
        try {
          // Apply RNNoise denoising
          this.rnnoise.denoise(this.inputBuffer, this.outputBuffer);

          // Write output
          output.set(this.outputBuffer, inputIndex - this.frameSize);
        } catch (error) {
          console.error('RNNoise processing error:', error);
          output.set(this.inputBuffer, inputIndex - this.frameSize);
        }

        // Reset buffer index for next frame
        this.bufferIndex = 0;
      }
    }

    // If there's remaining audio less than a full frame, pass it through
    if (this.bufferIndex > 0) {
      output.set(this.inputBuffer.subarray(0, this.bufferIndex), input.length - this.bufferIndex);
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
