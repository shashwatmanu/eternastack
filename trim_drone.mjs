import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath);

const inputPath = path.resolve('public/audio/drone.mp3');
const outputPath = path.resolve('public/audio/trim2_drone.mp3');

console.log('Trimming drone.mp3 to skip first 2 seconds...');
ffmpeg(inputPath)
  .setStartTime(2) // Skip first 2 seconds
  .audioBitrate('128k')
  .on('end', () => {
    console.log('Successfully trimmed drone.mp3');
    fs.renameSync(outputPath, inputPath);
  })
  .on('error', (err) => {
    console.error('Error trimming drone.mp3:', err);
  })
  .save(outputPath);
