
// src/components/SkillTree.tsx
import React from 'react';

type Node = { id: string; title: string; locked?: boolean; progress?: number };
type Props = { track: string; levels: Node[]; onOpen: (id:string)=>void };

export default function SkillTree({ track, levels, onOpen }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      {levels.map((lv, i) => (
        <button key={lv.id}
          onClick={() => !lv.locked && onOpen(lv.id)}
          className={`p-4 rounded-2xl shadow ${lv.locked ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-lg'}`}>
          <div className="text-sm uppercase tracking-wide mb-1">{track} L{i+1}</div>
          <div className="text-lg font-semibold">{lv.title}</div>
          <div className="mt-2 h-2 bg-gray-200 rounded">
            <div className="h-2 rounded bg-black" style={{width: (lv.progress||0)+'%'}} />
          </div>
        </button>
      ))}
    </div>
  );
}
