/**
 * Playlist of the game music.
 *
 * Built-in tracks are synthesised live (no file to download). To add your own music:
 *   1. put the file(s) in `public/music/` (create the folder) — mp3, ogg, m4a/aac, wav, flac or
 *      webm/opus; give several formats of the same piece in `sources`, the browser picks the first
 *      one it can play;
 *   2. add a line below with the moment it belongs to ('menu' = title/lobby, 'match' = in flight).
 * When a moment has file tracks, they are played in turn (looping if there is only one) and the
 * built-in track becomes the fallback if a file cannot be read.
 *
 * Before committing a file, strip its metadata (ID3, APE, C2PA…) — the repository privacy hook rejects
 * audio files that still carry such tags. See « Ajouter tes propres musiques » in README.md, e.g.
 *   ffmpeg -i in.wav -map_metadata -1 -fflags +bitexact -c:a libvorbis -q:a 5 public/music/out.ogg
 *   ffmpeg -i in.mp3 -map_metadata -1 -fflags +bitexact -id3v2_version 0 -write_id3v1 0 -c:a copy public/music/out.mp3
 * (a plain `-map_metadata -1` still writes an ID3 tag with the encoder name in MP3 files).
 */
export type MusicMoment = 'menu' | 'match';

export interface MusicTrack {
  id: string;
  title: string;
  moment: MusicMoment;
  /** Built-in synthesised piece */
  procedural?: 'music_box' | 'toy_march';
  /** External file(s), served from /music/… (same piece in several formats) */
  sources?: string[];
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'boite-a-musique', title: 'Boîte à musique', moment: 'menu', procedural: 'music_box' },
  { id: 'marche-des-jouets', title: 'Marche des jouets', moment: 'match', procedural: 'toy_march' },
  // Exemple de musique externe :
  // { id: 'ma-musique', title: 'Ma musique', moment: 'match', sources: ['/music/ma-musique.ogg', '/music/ma-musique.mp3'] },
];
