"""Sincroniza SOLO fixtures registrados. Secretos en entorno, nunca en docs/."""
import os, json, urllib.request, urllib.parse
BASE='https://v3.football.api-sports.io'
def request(url, headers, body=None):
    req=urllib.request.Request(url,headers=headers,data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)
def normalize(item):
    short=item['fixture']['status']['short']
    status={'FT':'finished','AET':'finished','PEN':'finished','CANC':'cancelled','PST':'postponed','SUSP':'postponed','INT':'postponed','ABD':'postponed','NS':'scheduled','TBD':'scheduled','1H':'live','HT':'live','2H':'live','ET':'live','BT':'live','P':'live'}.get(short)
    if status is None: return None # WO/AWD requieren resolución manual, no adivinar.
    score=item['score']['fulltime'] if status=='finished' else item['goals']
    home,away=score.get('home'),score.get('away')
    if status=='finished' and (home is None or away is None): return None
    return {'p_status':status,'p_home':home,'p_away':away,'p_kickoff':item['fixture']['date']}
def main():
    url=os.environ['SUPABASE_URL'].rstrip('/')+'/rest/v1/'
    key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'}
    matches=request(url+'matches?select=id,provider_id&provider_id=not.is.null&manual_override=eq.false',headers)
    mapped={m['provider_id']:m['id'] for m in matches}
    ids=list(mapped)
    count=0
    for start in range(0,len(ids),20):
        query=urllib.parse.urlencode({'ids':'-'.join(map(str,ids[start:start+20]))})
        result=request(BASE+'/fixtures?'+query,{'x-apisports-key':os.environ['API_FOOTBALL_KEY']})
        if result.get('errors'): raise RuntimeError('API-Football rechazó la consulta; revisa cuota y plan en el proveedor.')
        for item in result.get('response',[]):
            update=normalize(item)
            if update is not None and item['fixture']['id'] in mapped:
                request(url+'rpc/sync_result',headers,{'p_id':mapped[item['fixture']['id']],**update})
                count+=1
    print(f'{count} encuentros sincronizados. {len(ids)} IDs configurados.')
if __name__=='__main__': main()
