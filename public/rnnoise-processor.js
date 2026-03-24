/**
 * RNNoise AudioWorklet Processor
 * Uses the sync wasm loader so WorkletGlobalScope can initialize synchronously.
 */

import createRNNWasmModuleSync from '/rnnoise-sync.js';

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.module = null;
    this.statePtr = 0;
    this.inPtr = 0;
    this.outPtr = 0;
    this.isInitialized = false;
    this.enabled = true;

    this.frameSize = 480; // RNNoise frame size for 48kHz / 10ms
    this.inputBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;
    this.pendingOutput = [];
    this.pendingOutputReadIndex = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'enable') {
        this.enabled = event.data.enabled;
      }
    };

    this.initRNNoise();
  }

  async initRNNoise() {
    try {
      this.module = createRNNWasmModuleSync();
      await this.module.ready;

      this.module._rnnoise_init();
      this.statePtr = this.module._rnnoise_create();
      this.inPtr = this.module._malloc(this.frameSize * 4);
      this.outPtr = this.module._malloc(this.frameSize * 4);

      this.isInitialized = true;
      this.port.postMessage({ type: 'initialized' });
    } catch (error) {
      console.error('Failed to initialize RNNoise:', error);
      this.port.postMessage({ type: 'error', message: error?.message || 'RNNoise init failed' });
    }
  }

  denoiseFrame(inputFrame) {
    const heapOffsetIn = this.inPtr >> 2;
    const heapOffsetOut = this.outPtr >> 2;

    this.module.HEAPF32.set(inputFrame, heapOffsetIn);
    this.module._rnnoise_process_frame(this.statePtr, this.outPtr, this.inPtr);

    const denoised = this.module.HEAPF32.subarray(heapOffsetOut, heapOffsetOut + this.frameSize);
    this.outputBuffer.set(denoised);
  }

  enqueueFrame(frame) {
    for (let i = 0; i < frame.length; i++) {
      this.pendingOutput.push(frame[i]);
    }
  }

  dequeueSample(fallback) {
    if (this.pendingOutputReadIndex < this.pendingOutput.length) {
      const sample = this.pendingOutput[this.pendingOutputReadIndex];
      this.pendingOutputReadIndex += 1;

      if (this.pendingOutputReadIndex > 4096 && this.pendingOutputReadIndex * 2 > this.pendingOutput.length) {
        this.pendingOutput = this.pendingOutput.slice(this.pendingOutputReadIndex);
        this.pendingOutputReadIndex = 0;
      }

      return sample;
    }

    return fallback;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!output) return true;

    if (!input || !this.isInitialized || !this.enabled) {
      if (input) output.set(input);
      else output.fill(0);
      return true;
    }

    // First, ingest input and process complete RNNoise frames.
    let inputIndex = 0;
    while (inputIndex < input.length) {
      const samplesToRead = Math.min(this.frameSize - this.bufferIndex, input.length - inputIndex);
      this.inputBuffer.set(input.subarray(inputIndex, inputIndex + samplesToRead), this.bufferIndex);
      this.bufferIndex += samplesToRead;
      inputIndex += samplesToRead;

      if (this.bufferIndex === this.frameSize) {
        try {
          this.denoiseFrame(this.inputBuffer);
          this.enqueueFrame(this.outputBuffer);
        } catch (error) {
          console.error('RNNoise processing error:', error);
          this.enqueueFrame(this.inputBuffer);
        }
        this.bufferIndex = 0;
      }
    }

    // Then, render exactly one output quantum from the queued denoised samples.
    for (let i = 0; i < output.length; i++) {
      output[i] = this.dequeueSample(input[i] ?? 0);
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
