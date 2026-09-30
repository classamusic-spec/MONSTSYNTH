// 16-bit PCM WAV encoding/decoding: used to store Mimic's recordings and to
// export finished songs. Decoding goes through the browser (decodeAudioData).

export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numCh = channels.length;
  const length = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataSize = length * numCh * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const chans: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) chans.push(buffer.getChannelData(i));
  return encodeWav(chans, buffer.sampleRate);
}

export async function blobToAudioBuffer(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  return await ctx.decodeAudioData(data);
}
