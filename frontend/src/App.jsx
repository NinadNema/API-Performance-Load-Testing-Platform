import { useState } from 'react';

function App(){
    const[method, setMethod] = useState('GET');
    const[url, setUrl] = useState('');
    const[response, setResponse] = useState(null);
    const[loading, setLoading] = useState(false);
    const[headers, setHeaders] = useState('{}');
    const[body, setBody] = useState('');

    async function handleSend() {
      setLoading(true);
      setResponse(null);

      let parseHeaders = {};
      let parseBody = null;

      try{
        parseHeaders = headers.trim ? JSON.parse(headers) : {};
      }catch (err){
        setResponse({ success: false, error: 'Header is not valid JSON: ' + err.message });
        setLoading(false);
        return;
      }

      if(body.trim()){
        try{
          parseBody = JSON.parse(body);
        }catch(err){
          setResponse({ success: false, error: 'Body is not valid JSON: ' + err.message });
          setLoading(false);
          return;
        }
      }

      try{
        const res = await fetch('http://localhost:4000/api/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, url, headers: parseHeaders,body: parseBody}),
        });

        const data = await res.json();
        setResponse(data);
      }catch(err){
        setResponse({ success: false, error: err.message });
      }finally{
        setLoading(false);
      }
    }

    return(
      <div style={{ padding: '2em', maxWidth: '700px', margin: '0 auto' }}>
        <h1>API Load Tester</h1>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value={"GET"}>GET</option>
            <option value={"POST"}>POST</option>
            <option value={"PUT"}>PUT</option>
            <option value={"DELETE"}>DELETE</option>
          </select>

          <input 
            type="text"
            placeholder="https://api.example.com/endpoint"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex:1 }}
           />

          <button onClick={handleSend} disabled={loading || !url}>
            {loading ? 'Sending...': 'Send'}
          </button>

          {response && (
            <pre style={{background: '#1a1a1a', color: '#eee', padding: '1rem', marginTop: '1rem', overflow: 'auto'}}>
              {JSON.stringify(response, null, 2)}
            </pre>
          )}
        </div>

        <div style = {{ marginBottom: '1rem' }}>
          <label>Headers (JSON) </label>
          <textarea 
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder='{"Authorization" : "Bearer token"}'
            rows={3}
            style={{widtth: '100%', display: 'block' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Body (JSON, optional)</label>
          <textarea
            value={body}
            onChange={ (e) => setBody(e.target.value)}
            placeholder='{"key": "value"}'
            rows={4}
            style={{width: '100%', display: 'block' }}
          />
        </div>
      </div>
    );
}

export default App;