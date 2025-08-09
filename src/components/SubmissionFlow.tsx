
// src/components/SubmissionFlow.tsx
import React, { useState } from 'react';
import { RubricCard } from './RubricCard';

export default function SubmissionFlow({ rubric, onScored }:{ rubric: {name:string,max:number}[]; onScored: (r:any)=>void }){
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const resp = await fetch('/api/coach/score', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ deliverable: text, rubric })
      });
      const data = await resp.json();
      setResult(data);
      onScored?.(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <textarea className="w-full h-48 p-3 border rounded-xl" placeholder="Paste your work here…" value={text} onChange={e=>setText(e.target.value)}/>
      <button onClick={submit} disabled={loading} className="px-4 py-2 rounded-xl shadow">{loading?'Scoring…':'Submit for Score'}</button>
      {result && (
        <div className="space-y-4">
          <div className="text-xl font-semibold">Total: {result.total}</div>
          <RubricCard items={rubric} scores={result.scores}/>
          <div>
            <div className="font-semibold mb-1">Actions</div>
            <ul className="list-disc pl-5">{(result.actions||[]).map((a:string,i:number)=><li key={i}>{a}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
