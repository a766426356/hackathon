# Salamander Grand Piano — sample license

The 13 mp3 files in this directory are a subset of the **Salamander Grand Piano**
sample library by **Alexander Holm**.

- Source / download: <https://tonejs.github.io/audio/salamander/>
- Project page: <https://github.com/sfzinstruments/SalamanderGrandPiano>
- License: **Creative Commons Attribution 3.0 Unported (CC-BY 3.0)**
  <https://creativecommons.org/licenses/by/3.0/>

Files used:

```
C3.mp3   Ds3.mp3  Fs3.mp3  A3.mp3
C4.mp3   Ds4.mp3  Fs4.mp3  A4.mp3
C5.mp3   Ds5.mp3  Fs5.mp3  A5.mp3
C6.mp3
```

Changes made by this project:

- Only the 13 samples above are shipped (a subset of the full library).
- Playback pitch is shifted with `AudioBufferSourceNode.playbackRate` to reach
  the notes between the sampled roots.
- A short synthetic room reverb and a compressor are applied in `src/audio.js`.

Attribution requirement: if you redistribute this game, keep this notice and the
CC-BY 3.0 credit to Alexander Holm with the work.
