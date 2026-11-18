/**
 * Les écritures du MJ, chacune à son tour. Déplacer un objet ou des pièces, c'est lire les deux fiches, attendre le serveur
 * (création, mise à jour, suppression), puis écrire encore : deux demandes qui se croisent liraient le même état — l'objet
 * pris deux fois, la pile qui perd une quantité. Chaque geste attend donc la fin de ceux qui touchent aux mêmes acteurs, et
 * ne lit qu'une fois son tour venu.
 */

/** Par acteur (UUID), la fin du dernier geste inscrit. */
const tails = new Map();

/**
 * Exécute `fn` quand tous les gestes déjà inscrits sur l'un de ces acteurs sont finis (réussis ou non). L'inscription est
 * immédiate et se fait sur tous les acteurs d'un coup : un geste n'attend que ceux inscrits avant lui, jamais l'inverse —
 * pas d'attente croisée. Ne pas rappeler `inTurn` sur les mêmes acteurs depuis `fn` : il s'attendrait lui-même.
 * @param {(Actor|null)[]} actors
 * @param {() => Promise<any>} fn    À lire **dans** `fn` : tout ce dont le geste dépend (quantités, bourses, existence).
 * @returns {Promise<any>}           Ce que rend `fn` (ou son erreur).
 */
export function inTurn(actors, fn) {
  const keys = [...new Set(actors.map(a => a?.uuid).filter(Boolean))];
  const run = Promise.all(keys.map(k => tails.get(k))).then(fn);
  const tail = run.then(() => {}, () => {});
  for ( const k of keys ) tails.set(k, tail);
  tail.then(() => { for ( const k of keys ) if ( tails.get(k) === tail ) tails.delete(k); });
  return run;
}
