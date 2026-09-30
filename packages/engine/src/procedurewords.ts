/**
 * How each priced operation is written on a document.
 *
 * Shared by the two readers that have to turn a phrase into one of our procedures: the
 * health report (what the doctor advised) and the policy schedule (which operation a
 * limit is written against). It lived in the API's report reader until the second
 * reader needed it, and a second copy would have been a second place for "knee
 * replacement" to mean something different.
 *
 * Both halves of a pair must appear.
 */
const PROCEDURE_WORDS: Record<string, [RegExp, RegExp?]> = {
  "p-ankle-orif": [/\bankle\b|malleol/i, /\borif\b|fixation|plating|\bplate\b|screw|surgery|operat|open reduction/i],
  "p-spine-fusion": [/fusion|\btlif\b|\bplif\b/i, /spin|lumbar|l[1-5]/i],
  "p-cabg": [/\bcabg\b|bypass graft|coronary artery bypass/i],
  "p-angioplasty": [/angioplasty|\bptca\b|\bstent/i],
  "p-tkr": [/knee replacement|\btkr\b|\btka\b|arthroplasty.{0,20}knee|knee.{0,20}arthroplasty/i],
  "p-chole": [/cholecystectomy|lap\.? chole/i],
  "p-appendix": [/appendic?ectomy|appendectomy/i],
  "p-csection": [/caesarean|cesarean|\blscs\b|c[\s-]section/i],
  "p-delivery": [/normal delivery|vaginal delivery|\bnvd\b/i],
  "p-cataract": [/cataract|phaco|\biol\b/i],
  "p-chemo": [/chemotherapy|\bchemo\b/i],
  "p-dialysis": [/dialysis/i],
  "p-pneumonia": [/pneumonia/i],
  "p-sepsis": [/septic shock|sepsis/i],
  "p-observation": [/gastroenteritis/i],
};

export function procedureFor(text: string, procedures: { id: string }[]): string | null {
  const known = new Set(procedures.map((p) => p.id));
  for (const [id, [a, b]] of Object.entries(PROCEDURE_WORDS)) {
    if (!known.has(id)) continue;
    if (a.test(text) && (!b || b.test(text))) return id;
  }
  return null;
}
