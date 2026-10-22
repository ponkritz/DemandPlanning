// Windchill via a Windchill tab (web app). Windchill does not let this app read its answers (CORS), but code running on
// the Windchill page itself, in the user's signed-in browser, can. The app opens Windchill in a tab; the user clicks the
// "Windchill → app" bookmark there once. The bookmark asks the app (the tab's opener, this app's origin only) for the
// searches, runs them read-only on Windchill (following next pages on the same host, at most 20,000 results each) and
// sends the results back to the app. The app accepts them only from the Windchill origin, from the tab it opened, with
// the request's one-time code.
export const bridgeKey = 'dph-windchill'
export interface BridgeRequest { app: typeof bridgeKey; type: 'request'; nonce: string; service: string; views: { id: string; path: string }[] }
export type BridgeResult = { id: string; rows: Record<string, unknown>[] } | { id: string; error: string }

// The bookmark's code for this app's origin. Kept on one line; only the app origin is filled in.
export function windchillBookmarklet(appOrigin: string) {
  const code = `(async()=>{const A=${JSON.stringify(appOrigin)},K=${JSON.stringify(bridgeKey)},o=window.opener;`
    + `if(!o){alert('Open this tab with "Fetch via Windchill tab" in the Demand Planning app, then click this bookmark again. If you did, Windchill cut the link back to the app; use Open in browser and Import instead.');return}`
    + `let q;try{q=await new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error('The app did not answer; click Fetch via Windchill tab in the app again.')),15000);`
    + `addEventListener('message',function h(e){if(e.origin!==A||!e.data||e.data.app!==K||e.data.type!=='request')return;clearTimeout(t);removeEventListener('message',h);ok(e.data)});o.postMessage({app:K,type:'ready'},A)})}catch(e){alert(e.message);return}`
    + `const s=String(q.service||'').replace(/\\/+$/,'');if(!s||new URL(s).origin!==location.origin){alert('This tab is not the Windchill set in the app ('+s+').');return}`
    + `document.title='Searching Windchill...';const out=[];`
    + `for(const v of q.views||[]){try{let rows=[],n=s+'/'+v.path,p=0;while(n&&p<100){const u=new URL(n);if(u.origin!==location.origin||!u.pathname.startsWith(new URL(s).pathname+'/'))throw new Error('Windchill returned a next page outside the service.');`
    + `const r=await fetch(u.href,{credentials:'include',headers:{Accept:'application/json'}}),x=await r.text();let j;try{j=JSON.parse(x)}catch(_){throw new Error(r.ok?'Windchill answered with a web page (sign in, then try again).':'Windchill answered with status '+r.status+'.')}`
    + `if(!r.ok)throw new Error('Windchill answered with status '+r.status+(j&&j.error&&j.error.message?': '+j.error.message:'')+'.');if(!Array.isArray(j.value))throw new Error('Windchill answered without a list of results.');`
    + `rows=rows.concat(j.value);if(rows.length>20000)throw new Error('More than 20,000 results; narrow the filters.');n=typeof j['@odata.nextLink']==='string'?new URL(j['@odata.nextLink'],u).href:'';p++}out.push({id:v.id,rows})}catch(e){out.push({id:v.id,error:String(e&&e.message||e)})}}`
    + `o.postMessage({app:K,type:'results',nonce:q.nonce,results:out},A);document.title='Sent to the app';`
    + `alert('Windchill results sent to the app: '+out.map(r=>r.error?'error':r.rows.length+' results').join(', ')+'. You can close this tab.')})()`
  return `javascript:${code}`
}

// The results message from the bookmark, checked against the request: known views only, rows as objects, at most 20,000.
export function parseBridgeResults(data: unknown, nonce: string, viewIds: string[]): BridgeResult[] | null {
  const message = data as { app?: unknown; type?: unknown; nonce?: unknown; results?: unknown } | null
  if (!message || message.app !== bridgeKey || message.type !== 'results' || message.nonce !== nonce || !Array.isArray(message.results)) return null
  const results: BridgeResult[] = []
  for (const entry of message.results as { id?: unknown; rows?: unknown; error?: unknown }[]) {
    if (!entry || typeof entry.id !== 'string' || !viewIds.includes(entry.id) || results.some((result) => result.id === entry.id)) continue
    if (typeof entry.error === 'string') results.push({ id: entry.id, error: entry.error.slice(0, 500) })
    else if (Array.isArray(entry.rows) && entry.rows.length <= 20000) results.push({ id: entry.id, rows: entry.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) })
    else results.push({ id: entry.id, error: 'The results from Windchill were not a list (or more than 20,000).' })
  }
  return results
}
