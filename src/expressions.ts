/**
 * Every face she has a name for, with the kaomoji that stands for it.
 *
 * This is the café plugin's own mood table, copied verbatim: she is told to end
 * each reply with `【 開心 ( ˶ˆᗜˆ˵ ) 】`, picking the kaomoji from that list, so a
 * marker she writes on her own already names a face — and a name here is also
 * the filename of the artwork wearing it.
 *
 * The spacing is not decoration: it is the one part of a kaomoji the lookup
 * ignores, which makes it the only safe way to even out how wide these are —
 * and they sit in a status line, where a marker three times the width of the
 * last one makes the whole row jump.
 */
export const KAOMOJI = {
  // Everyday, at work
  neutral: '( • ᴗ • )',
  happy: '＼(ˆ ᗜ ˆ)／',
  curious: '(づ •. •)?',
  thinking: '( ╭ರ_•́ )',
  focused: '(๑•̀ ᴗ•́)૭✧',
  confused: '( ⊙.⊙ )?',

  // Turned on the master
  proud: 'ᕙ( •̀ ᗜ •́)ᕗ',
  smug: '( ｀▽´ )',
  impressed: '( ✧ ᗜ ✧ )',
  flirty: '( ˘ ³˘)♡',
  horny: '(,,ᴗ ᴗ,,)♡',
  wink: '☆ ( ＞◡❛)',
  embarrassed: '( ˶>﹏<˶ᵕ)',
  pouty: '( •̀ ε •́ )',
  worried: '(´･ω･｀)',

  // The basic six, and the seventh nobody agreed on
  sad: '(｡•́︿•̀｡)',
  surprised: 'Σ( °口° )',
  angry: '( ＃•̀_•́ )',
  afraid: '( ;ﾟдﾟ )',
  disgusted: '(￣～￣;)',
  skeptical: '(￢‸￢)…',

  // Something went wrong
  frustrated: '(,,>﹏<,,)',
  awkward: '( ^_^; )',
  sorry: 'm( _ _ )m',
  speechless: '(・_・;)',
  relieved: '( ˘ᗜ˘ )⁼³',
} as const

export type Expression = keyof typeof KAOMOJI

/**
 * Which face a mood marker is wearing. The kaomoji are copied by hand into her
 * replies, so a stray space or a missing bracket shouldn't cost her the face —
 * the match is on the marker's letters and symbols with the spacing dropped.
 */
export function faceFor(marker: string): Expression | null {
  const worn = bare(marker)
  for (const [expression, kaomoji] of Object.entries(KAOMOJI)) {
    if (worn.includes(bare(kaomoji))) return expression as Expression
  }
  return null
}

const bare = (text: string) => text.replace(/\s+/g, '')
