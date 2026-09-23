export const outcome = m => m.status === 'finished' && Number.isInteger(m.home_score) && Number.isInteger(m.away_score) ? (m.home_score > m.away_score ? 'L' : m.home_score < m.away_score ? 'V' : 'E') : null;
export const closed = (r, now = Date.now()) => now >= Date.parse(r.deadline);
export const complete = matches => matches.length > 0 && matches.every(m => ['finished','cancelled'].includes(m.status));
export function standings(profiles, picks, matches) {
 return profiles.filter(p=>picks.some(x=>x.user_id===p.id && matches.some(m=>m.id===x.match_id))).map(p=>({...p,points:picks.filter(x=>x.user_id===p.id && matches.some(m=>m.id===x.match_id && outcome(m)===x.choice)).length})).sort((a,b)=>b.points-a.points || a.name.localeCompare(b.name));
}
export const winners = rows => rows.length ? rows.filter(r=>r.points === rows[0].points) : [];
export const escapeHtml = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
