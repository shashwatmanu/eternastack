import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath);

const audioDir = path.resolve('public/audio');
const filesToTrim = ['bee.mp3', 'cavern.mp3', 'drone.mp3', 'ground.mp3', 'space.mp3'];

async function trimAudio(filename) {
  const inputPath = path.join(audioDir, filename);
  const outputPath = path.join(audioDir, `trim_${filename}`);

  if (!fs.existsSync(inputPath)) {
    console.log(`File not found: ${inputPath}`);
    return;
  }

  return new Promise((resolve, reject) => {
    console.log(`Trimming ${filename}...`);
    ffmpeg(inputPath)
      .setDuration(12) // Trim to first 12 seconds
      .audioBitrate('128k') // Compress the bitrate to save even more space!
      .on('end', () => {
        console.log(`Successfully trimmed ${filename}`);
        // Replace original with trimmed
        fs.renameSync(outputPath, inputPath);
        resolve();
      })
      .on('error', (err) => {
        console.error(`Error trimming ${filename}:`, err);
        reject(err);
      })
      .save(outputPath);
  });
}

async function run() {
  for (const file of filesToTrim) {
    try {
      await trimAudio(file);
    } catch (e) {}
  }
  console.log("All audio files trimmed!");
}

run();
