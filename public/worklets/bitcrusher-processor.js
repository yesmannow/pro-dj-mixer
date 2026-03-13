class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'decimation',
        defaultValue: 4,
        minValue: 1,
        maxValue: 24,
        automationRate: 'k-rate',
      },
      {
        name: 'reduction',
        defaultValue: 4,
        minValue: 1,
        maxValue: 128,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.step = 0;
    this.holdSample = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    if (!inputChannel || !outputChannel) {
      return true;
    }

    const decimationParam = parameters.decimation;
    const reductionParam = parameters.reduction;
    const decimation = Math.max(1, Math.round(decimationParam.length > 0 ? decimationParam[0] : 4));
    const reduction = Math.max(1, reductionParam.length > 0 ? reductionParam[0] : 4);

    for (let i = 0; i < inputChannel.length; i++) {
      if (this.step % decimation === 0) {
        const sample = inputChannel[i];
        this.holdSample = Math.floor(sample * reduction) / reduction;
      }
      outputChannel[i] = this.holdSample;
      this.step++;
    }

    return true;
  }
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);
